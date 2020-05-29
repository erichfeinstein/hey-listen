var Discord = require('discord.js');
var YouTube = require('youtube-node');
const ytdl = require('ytdl-core-discord');
var googleSpeech = require('@google-cloud/speech');
var logger = require('winston');
var auth = require('./auth.json');
var youtubeAuth = require('./youtube-credentials.json');
console.log(youtubeAuth);
require('dotenv').config();

const ConvertTo1ChannelStream = require('./stream');

const PREFIX = '+';
const BOT_KEYWORD = 'robot';
const YOUTUBE_VIDEO_PREFIX = 'https://www.youtube.com/watch?v=';

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console(), {
  colorize: true,
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client();
bot.login(auth.token);

// Initialize Google Speech
const googleSpeechClient = new googleSpeech.SpeechClient();

// Initialize YouTube
var youTube = new YouTube();
youTube.setKey(youtubeAuth.key);

bot.on('ready', function (evt) {
  logger.info('Connected');
});

var connection;
var channel;
bot.on('message', async (msg) => {
  if (msg.content.charAt(0) !== PREFIX) {
    return;
  }
  const messageContent = msg.content.substring(1);
  if (!msg.guild) return;

  //Join the voice channel
  if (messageContent === 'join') {
    channel = msg.channel;
    connection = await msg.member.voice.channel.join();
    connection.on('speaking', (user, speaking) => {
      if (!user) return;
      const receiver = connection.receiver;
      const audioStream = receiver.createStream(user, { mode: 'pcm' });
      const requestConfig = {
        encoding: 'LINEAR16',
        sampleRateHertz: 48000,
        languageCode: 'en-US',
      };
      const request = {
        config: requestConfig,
      };
      const recognizeStream = googleSpeechClient
        .streamingRecognize(request)
        .on('error', console.error)
        .on('data', async (response) => {
          const transcription = response.results
            .map((result) => result.alternatives[0].transcript)
            .join('\n')
            .toLowerCase();
          console.log('TRANSCRIPTION: ', transcription);
          if (transcription.includes(BOT_KEYWORD)) {
            const query = transcription.substring(
              transcription.indexOf(BOT_KEYWORD) + BOT_KEYWORD.length + 1
            );
            // YouTube Search
            youTube.search(query, 2, async function (error, result) {
              if (error) {
                console.log(error);
              } else {
                const youTubeUrl = result.items[0].id.videoId;
                console.log(youTubeUrl);
                connection.play(await ytdl(youTubeUrl), { type: 'opus' });
              }
            });
          }
        });

      const convertTo1ChannelStream = new ConvertTo1ChannelStream();
      audioStream.pipe(convertTo1ChannelStream).pipe(recognizeStream);
    });
  }
  //Leave the voice channel
  else if (messageContent === 'leave') {
    await msg.member.voice.channel.leave();
    connection = null;
  }
});
