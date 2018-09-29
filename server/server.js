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
const express = require('express');

const app = express();

const scraperController = require('./scraper');

app.get(
  '/getgamedata/:targetGame',
  scraperController.logParams,
  scraperController.createTopSellersObj,
  scraperController.sendIfClientWantsAll, // can send response
  scraperController.getSteamAppID,
  scraperController.collectTargetData,
  scraperController.extractRelevantData,
  (req, res) => res.json(res.locals.desiredData),
);

app.get('*', (req, res) => res.status(404).send('Route not found.'));

app.use(() => console.log('Hello'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(`Sorry, something went wrong: ${err}\nPlease be aware that game names are case sensitive...`);
});

app.listen(3001, () => console.log('listening on 3001...\n'));

module.exports = app;
