require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
} = require("@discordjs/voice");
const ytdl = require("@distube/ytdl-core");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const queue = new Map();

client.once("ready", () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const serverQueue = queue.get(message.guild.id);
  const args = message.content.split(" ");
  const command = args.shift().toLowerCase();

  if (command === "!play") {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel)
      return message.reply("❌ Você precisa estar em um canal de voz!");
    if (!args.length)
      return message.reply("❌ Você precisa fornecer a URL da música!");

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("Connect") || !permissions.has("Speak")) {
      return message.reply("❌ Eu não tenho permissão para entrar ou falar no canal.");
    }

    const url = args[0];

    if (!ytdl.validateURL(url)) {
      return message.reply("❌ URL inválida. Envie uma URL do YouTube válida.");
    }

    const songInfo = await ytdl.getInfo(url);
    const song = {
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
    };

    if (!serverQueue) {
      const queueContruct = {
        textChannel: message.channel,
        voiceChannel,
        connection: null,
        player: null,
        songs: [],
        playing: true,
      };

      queue.set(message.guild.id, queueContruct);
      queueContruct.songs.push(song);

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        queueContruct.connection = connection;
        playSong(message.guild, queueContruct.songs[0]);
      } catch (err) {
        console.error(err);
        queue.delete(message.guild.id);
        return message.channel.send("❌ Erro ao conectar no canal de voz.");
      }
    } else {
      serverQueue.songs.push(song);
      return message.channel.send(`✅ **${song.title}** adicionada à fila!`);
    }
  }

  if (command === "!skip") {
    if (!serverQueue) return message.reply("❌ Não há música para pular.");
    serverQueue.player.stop();
    message.reply("⏭️ Pulando para a próxima música.");
  }

  if (command === "!pause") {
    if (!serverQueue || !serverQueue.player)
      return message.reply("❌ Nenhuma música está tocando.");
    serverQueue.player.pause();
    message.reply("⏸️ Música pausada.");
  }

  if (command === "!resume") {
    if (!serverQueue || !serverQueue.player)
      return message.reply("❌ Nenhuma música está tocando.");
    serverQueue.player.unpause();
    message.reply("▶️ Música retomada.");
  }
});

async function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    getVoiceConnection(guild.id)?.destroy();
    queue.delete(guild.id);
    return;
  }

  const stream = ytdl(song.url, { filter: "audioonly", quality: "highestaudio" });
  const resource = createAudioResource(stream);

  const player = createAudioPlayer();
  player.play(resource);
  serverQueue.player = player;

  serverQueue.connection.subscribe(player);

  player.on(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });

  player.on("error", (error) => {
    console.error("Erro ao tocar música:", error);
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });

  serverQueue.textChannel.send(`🎶 Agora tocando: **${song.title}**`);
}

client.login(process.env.DISCORD_TOKEN);
