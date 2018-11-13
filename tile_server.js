"use strict";

const path = require("path");
const url = require("url");

const cachecache = require("cachecache");
const clone = require("clone");
const express = require("express");
const handlebars = require("handlebars");
const mercator = new (require("@mapbox/sphericalmercator"))();

var SCALE_PATTERN = "@[23]x";

// TODO a more complete implementation of this exists...somewhere
var getExtension = function(format) {
  // trim PNG variant info
  switch ((format || "").replace(/^(png).*/, "$1")) {
    case "png":
      return "png";

    default:
      return format;
  }
};

var getInfo = function(source, callback) {
  return source.getInfo(function(err, _info) {
    if (err) {
      return callback(err);
    }

    var info = {};

    Object.keys(_info).forEach(function(key) {
      info[key] = _info[key];
    });

    info.name = info.name || "Untitled";
    info.center = info.center || [-122.444, 37.7908, 12];
    info.bounds = info.bounds || [-180, -85.0511, 180, 85.0511];
    info.format = info.format || "png";
    info.minzoom = Math.max(0, info.minzoom | 0);
    info.maxzoom = info.maxzoom || Infinity;

    if (info.vector_layers) {
      info.format = "pbf";
    }

    return callback(null, info);
  });
};

var getScale = function(scale) {
  return (scale || "@1x").slice(1, 2) | 0;
};

var normalizeHeaders = function(headers) {
  var _headers = {};

  Object.keys(headers).forEach(function(x) {
    _headers[x.toLowerCase()] = headers[x];
  });

  return _headers;
};

module.exports = function(tilelive, options) {
  var app = express()
      .disable("x-powered-by")
      .enable("trust proxy"),
    templates = {},
    uri = options,
    tilePath = "/{z}/{x}/{y}.{format}",
    sourceMaxZoom = null,
    tilePattern;

  app.use(cachecache());

  if (typeof options === "object") {
    uri = options.source;
    tilePath = options.tilePath || tilePath;

    if (options.sourceMaxZoom) {
      sourceMaxZoom = parseInt(options.sourceMaxZoom);
    }

    Object.keys(options.headers || {}).forEach(function(name) {
      templates[name] = handlebars.compile(options.headers[name]);

      // attempt to parse so we can fail fast
      try {
        templates[name]();
      } catch (e) {
        console.error("'%s' header is invalid:", name);
        console.error(e.message);
        process.exit(1);
      }
    });
  }

  if (typeof uri === "string") {
    uri = url.parse(uri, true);
  } else {
    uri = clone(uri);
  }

  tilePattern = tilePath
    .replace(/\.(?!.*\.)/, ":scale(" + SCALE_PATTERN + ")?.")
    .replace(/\./g, ".")
    .replace("{z}", ":z(\\d+)")
    .replace("{x}", ":x(\\d+)")
    .replace("{y}", ":y(\\d+)")
    .replace("{format}", ":format([\\w\\.]+)");

  var populateHeaders = function(headers, params, extras) {
    Object.keys(extras || {}).forEach(function(k) {
      params[k] = extras[k];
    });

    Object.keys(templates).forEach(function(name) {
      var val = templates[name](params);

      if (val) {
        headers[name.toLowerCase()] = val;
      }
    });

    return headers;
  };

  var sourceURIs = {
    1: uri
  };

  [2, 3].forEach(function(scale) {
    var retinaURI = clone(uri);

    retinaURI.query.scale = scale;
    // explicitly tell tilelive-mapnik to use larger tiles
    retinaURI.query.tileSize = scale * 256;

    sourceURIs[scale] = retinaURI;
  });

  var getTile = function(z, x, y, scale, format, callback) {
    var sourceURI = sourceURIs[scale],
      params = {
        tile: {
          zoom: z,
          x: x,
          y: y,
          format: format,
          retina: scale > 1,
          scale: scale
        }
      };

    // Additional params for vector tile based sources
    if (sourceMaxZoom != null) {
      params.tile.sourceZoom = z;
      params.tile.sourceX = x;
      params.tile.sourceY = y;

      while (params.tile.sourceZoom > sourceMaxZoom) {
        params.tile.sourceZoom--;
        params.tile.sourceX = Math.floor(params.tile.sourceX / 2);
        params.tile.sourceY = Math.floor(params.tile.sourceY / 2);
      }
    }

    return tilelive.load(sourceURI, function(err, source) {
      if (err) {
        return callback(err);
      }

      return getInfo(source, function(err, info) {
        if (err) {
          return callback(err);
        }

        // validate format / extension
        var ext = getExtension(info.format);

        if (ext !== format) {
          return callback(
            null,
            null,
            populateHeaders({}, params, { 404: true, invalidFormat: true })
          );
        }

        // validate zoom
        if (z < info.minzoom || z > info.maxzoom) {
          return callback(
            null,
            null,
            populateHeaders({}, params, { 404: true, invalidZoom: true })
          );
        }

        // validate coords against bounds
        var xyz = mercator.xyz(info.bounds, z);

        if (x < xyz.minX || x > xyz.maxX || y < xyz.minY || y > xyz.maxY) {
          return callback(
            null,
            null,
            populateHeaders({}, params, { 404: true, invalidCoordinates: true })
          );
        }

        return source.getTile(z, x, y, function(err, data, headers) {
          headers = normalizeHeaders(headers || {});

          if (err) {
            if (err.message.match(/(Tile|Grid) does not exist/)) {
              return callback(
                null,
                null,
                populateHeaders(headers, params, { 404: true })
              );
            }

            return callback(err);
          }

          if (data === null || data === undefined) {
            return callback(
              null,
              null,
              populateHeaders(headers, params, { 404: true })
            );
          }

          return callback(
            null,
            data,
            populateHeaders(headers, params, { 200: true })
          );
        });
      });
    });
  };

  app.get(tilePattern, function(req, res, next) {
    var z = req.params.z | 0,
      x = req.params.x | 0,
      y = req.params.y | 0,
      scale = getScale(req.params.scale),
      format = req.params.format;
    return getTile(
      z,
      x,
      y,
      scale,
      format,
      function(err, data, headers) {
        if (err) {
          return next(err);
        }
        if (data == null) {
          return res.status(404).send("Not found");
        } else {
          res.set(headers);
          return res.status(200).send(data);
        }
      },
      res,
      next
    );
  });

  app.get("/index.json", function(req, res, next) {
    var params = {
      tileJSON: true
    };

    return tilelive.load(uri, function(err, source) {
      if (err) {
        return next(err);
      }

      return getInfo(source, function(err, info) {
        if (err) {
          return next(err);
        }

        var protocol = req.headers["x-forwarded-proto"] || req.protocol;
        var host = req.headers["x-forwarded-host"] || req.headers.host;
        var uri =
          protocol +
          "://" +
          host +
          (
            path.dirname(req.originalUrl) +
            tilePath.replace("{format}", getExtension(info.format))
          ).replace(/\/+/g, "/");

        info.tiles = [uri];
        info.tilejson = "2.0.0";
        info.scheme = "xyz";

        res.set(populateHeaders({}, params, { 200: true }));
        return res.send(info);
      });
    });
  });

  return app;
};
