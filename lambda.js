"use strict";

const awsServerlessExpress = require("aws-serverless-express");

const app = require("./app");

const BINARY_MEDIA_TYPES = [
  "application/octet-stream",
  "font/eot",
  "font/opentype",
  "font/otf",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/tiff",
  "application/vnd.mapbox-vector-tile"
];

const server = awsServerlessExpress.createServer(app, null, BINARY_MEDIA_TYPES);

exports.handler = (event, context) =>
  awsServerlessExpress.proxy(server, event, context);
