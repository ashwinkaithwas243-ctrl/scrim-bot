require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits
} = require('discord.js');

const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

/* ================= SETTINGS ================= */

const SETTINGS = {
  REG_CHANNEL_ID: '1498506314941468713',
  PING_ROLE_ID: '1500028011519410296',
  CONFIRM_ROLE_ID: '1498524809158590484',

  TOTAL_SLOTS: 12,
  REQUIRED_TAGS: 2,

  REG_OPEN_HOUR: 12,
  REG_OPEN_MINUTE: 0,

  REG_CLOSE_HOUR: 17,
  REG_CLOSE_MINUTE: 0,

  REG_OPEN_MESSAGE: '🔥 REGISTRATION OPENED 🔥',
  REG_CLOSE_MESSAGE: '🔒 REGISTRATION CLOSED 🔒',

  PINNED_PANEL_TITLE: '📌 WEEKLY REGISTRATION',

  REG_OPEN_BANNER:
    'https://cdn.discordapp.com/attachments/1412823770833616967/1500002044801712259/ChatGPT_Image_May_2_2026_10_29_19_AM.png',

  REG_CLOSE_BANNER:
    'https://cdn.discordapp.com/attachments/1412823770833616967/1500002044264583219/ChatGPT_Image_May_2_2026_10_30_15_AM.png',

  PINNED_PANEL_BANNER:
    'https://cdn.discordapp.com/attachments/1412823770833616967/1499995648911474798/ChatGPT_Image_Apr_28_2026_07_54_51_AM.png'
};

/* ================= DATABASE ================= */

let slots = [];
let registrationOpen = false;

/* ================= SLASH COMMANDS ================= */

const commands = [
  new SlashCommandBuilder()
    .setName('openscrim')
    .setDescription('Open registration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('closescrim')
    .setDescription('Close registration')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('slotlist')
    .setDescription('Show slot list'),

  new SlashCommandBuilder()
    .setName('resetscrim')
    .setDescription('Reset scrim')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setslots')
    .setDescription('Set total slots')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of slots')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('settags')
    .setDescription('Set required tags')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Required tags')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

].map(command => command.toJSON());

/* ================= READY ================= */

client.once('ready', async () => {

  console.log(`${client.user.tag} is online!`);

  try {

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

   await rest.put(
  Routes.applicationGuildCommands(
    client.user.id,
    '927050813971505163'
  ),
  { body: commands }
);

    console.log('Slash commands loaded!');

  } catch (err) {
    console.log(err);
  }
});

/* ================= FUNCTIONS ================= */

async function clearChannel(channel) {

  const messages = await channel.messages.fetch({ limit: 100 });

  await channel.bulkDelete(messages, true);
}

async function sendPinnedPanel(channel) {

  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle(SETTINGS.PINNED_PANEL_TITLE)
    .setDescription(
      `🎯 TOTAL SLOTS: ${SETTINGS.TOTAL_SLOTS}\n` +
      `🏷️ REQUIRED TAGS: ${SETTINGS.REQUIRED_TAGS}\n\n` +
      `📌 REGISTRATION FORMAT:\n\n` +
      `TEAM NAME - XYZ ESPORTS\n` +
      `<@player1>\n` +
      `<@player2>`
    )
    .setImage(SETTINGS.PINNED_PANEL_BANNER);

  const msg = await channel.send({
    content: `@everyone <@&${SETTINGS.PING_ROLE_ID}>`,
    embeds: [embed]
  });

  await msg.pin();
}

async function openRegistration() {

  const channel = await client.channels.fetch(SETTINGS.REG_CHANNEL_ID);

  registrationOpen = true;

  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    SendMessages: true
  });

  const embed = new EmbedBuilder()
    .setColor('#00ff00')
    .setDescription(SETTINGS.REG_OPEN_MESSAGE)
    .setImage(SETTINGS.REG_OPEN_BANNER);

  await channel.send({
    content: `@everyone <@&${SETTINGS.PING_ROLE_ID}>`,
    embeds: [embed]
  });

  await sendPinnedPanel(channel);

  console.log('Registration opened!');
}

async function closeRegistration() {

  const channel = await client.channels.fetch(SETTINGS.REG_CHANNEL_ID);

  registrationOpen = false;

  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    SendMessages: false
  });

  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setDescription(SETTINGS.REG_CLOSE_MESSAGE)
    .setImage(SETTINGS.REG_CLOSE_BANNER);

  await channel.send({
    embeds: [embed]
  });

  console.log('Registration closed!');
}

/* ================= REGISTRATION ================= */

client.on('messageCreate', async message => {

  if (message.author.bot) return;

  if (message.channel.id !== SETTINGS.REG_CHANNEL_ID) return;

  if (!registrationOpen) return;

  if (slots.length >= SETTINGS.TOTAL_SLOTS) {

    await message.react('❌');

    return;
  }

  const mentions = [...message.mentions.users.values()];

  if (mentions.length !== SETTINGS.REQUIRED_TAGS) {

    await message.react('❌');

    return;
  }

  const unique = new Set(mentions.map(m => m.id));

  if (unique.size !== mentions.length) {

    await message.react('❌');

    return;
  }

  const duplicate = slots.some(team =>
    mentions.some(player => team.players.includes(player.id))
  );

  if (duplicate) {

    await message.react('❌');

    return;
  }

  const teamData = {
    captain: message.author.id,
    players: mentions.map(m => m.id),
    text: message.content
  };

  slots.push(teamData);

  await message.react('✅');

  try {

    const member = await message.guild.members.fetch(message.author.id);

    await member.roles.add(SETTINGS.CONFIRM_ROLE_ID);

  } catch {}

  if (slots.length >= SETTINGS.TOTAL_SLOTS) {

    await closeRegistration();
  }
});

/* ================= SLASH COMMANDS ================= */

client.on('interactionCreate', async interaction => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'openscrim') {

    await openRegistration();

    return interaction.reply({
      content: '✅ Registration opened',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'closescrim') {

    await closeRegistration();

    return interaction.reply({
      content: '🔒 Registration closed',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'resetscrim') {

    slots = [];

    return interaction.reply({
      content: '♻️ Scrim reset complete',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'slotlist') {

    if (slots.length === 0) {

      return interaction.reply({
        content: '❌ No teams registered',
        ephemeral: true
      });
    }

    let text = '';

    slots.forEach((team, index) => {

      text += `🏆 SLOT ${index + 1}\n${team.text}\n\n`;
    });

    return interaction.reply({
      content: text.slice(0, 1900),
      ephemeral: true
    });
  }

  if (interaction.commandName === 'setslots') {

    SETTINGS.TOTAL_SLOTS =
      interaction.options.getInteger('amount');

    return interaction.reply({
      content: `✅ Total slots set to ${SETTINGS.TOTAL_SLOTS}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'settags') {

    SETTINGS.REQUIRED_TAGS =
      interaction.options.getInteger('amount');

    return interaction.reply({
      content: `✅ Required tags set to ${SETTINGS.REQUIRED_TAGS}`,
      ephemeral: true
    });
  }
});

/* ================= DAILY RESET ================= */

cron.schedule('0 0 * * *', async () => {

  const channel = await client.channels.fetch(SETTINGS.REG_CHANNEL_ID);

  slots = [];

  registrationOpen = false;

  await clearChannel(channel);

  await sendPinnedPanel(channel);

  console.log('Daily reset complete!');
});

/* ================= AUTO OPEN ================= */

cron.schedule(
  `${SETTINGS.REG_OPEN_MINUTE} ${SETTINGS.REG_OPEN_HOUR} * * *`,
  async () => {

    await openRegistration();
  }
);

/* ================= AUTO CLOSE ================= */

cron.schedule(
  `${SETTINGS.REG_CLOSE_MINUTE} ${SETTINGS.REG_CLOSE_HOUR} * * *`,
  async () => {

    await closeRegistration();
  }
);

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);