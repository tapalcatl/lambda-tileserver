"use strict";

const cors = require("cors");
const env = require("require-env");
const express = require("express");
const morgan = require("morgan");
const responseTime = require("response-time");
const tilelive = require("tilelive-cache")(require("@mapbox/tilelive"));

require("tilelive-modules/loader")(tilelive);

const tileServer = require("./tile_server");

const app = express().disable("x-powered-by");

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

app.use(responseTime());
app.use(cors());
app.use(tileServer(tilelive, env.require("SOURCE")));

module.exports = app;