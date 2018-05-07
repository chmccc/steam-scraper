/*

^_^ STEAM SCRAPER ^_^
-_-_-_-_-_-_-_-_-_-_-

Gets various lists of top sellers from Steam frontend, collects further details from Steam's own API

GET request as follows:

server:port/getgamedata/<query>

Where <query> can be 'all' for all current top sellers plus top sellers in RPG & strategy genres
--OR-- <query> can be a specific game name from that list for select details.
When querying, game names are case sensitive and use whitespace, not '%20'.

*/

'use strict';

const express = require('express');
const app = express();
const scraperController = require('./scraper');

app.get(
  '/getgamedata/:targetGame',
  scraperController.declareParams,
  scraperController.createTopSellersObj,
  scraperController.filterSwitch,
  scraperController.collectTargetData,
  scraperController.extractRelevantData,
);

app.listen(3001);

module.exports = app;
