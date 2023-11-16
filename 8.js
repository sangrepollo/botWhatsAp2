const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const { mensajes } = require('./mensaje');

const messagesQueue = {};

async function run() {
    try {
        console.log('Starting WhatsApp bot');
        const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
        const sock = await makeWASocket({
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            auth: state
        });

        let sentMessage; // Declarar sentMessage en un alcance superior

        sock.ev.on('connection.update', update => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error.hasOwnProperty('output')) {
                    console.log("Connection error, reconnecting...");
                    run();
                } else if (lastDisconnect.error.output.statusCode === DisconnectReason.unknown) {
                    console.log("Disconnected, reconnecting...");
                    run();
                }
            } else if (connection === 'open') {
                console.log("Connected successfully to WhatsApp.");
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const message of messages) {
                console.log('Message Received:');
                console.log('Sender:', message.key.remoteJid);
                console.log('Content:', message.message);
                console.log('-------------------');

                if (message.key.remoteJid.includes('@g.us')) {
                    const groupJid = message.key.remoteJid;
                    const participant = message.key.participant;

                    if (!messagesQueue[groupJid]) {
                        messagesQueue[groupJid] = {};
                    }
                    if (!messagesQueue[groupJid][participant]) {
                        messagesQueue[groupJid][participant] = 0;
                    }

                    messagesQueue[groupJid][participant]++;

                    if (messagesQueue[groupJid][participant] >= 7) {
                        messagesQueue[groupJid][participant] = 0;
                        try {
                            const randomMessage = mensajes[Math.floor(Math.random() * mensajes.length)];

                            // Obtener la lista de archivos en la carpeta de imágenes
                            const imageFolder = './img/';
                            const imageFiles = fs.readdirSync(imageFolder);

                            // Seleccionar una imagen aleatoria de la carpeta
                            const randomImageFileName = imageFiles[Math.floor(Math.random() * imageFiles.length)];
                            const imagePath = imageFolder + randomImageFileName;
                            const imageBuffer = fs.readFileSync(imagePath);

                            // Enviar la imagen aleatoria al grupo
                            const imageOptions = {
                                mimetype: 'image/jpeg',
                                filename: randomImageFileName,
                                caption: randomMessage
                            };

                            sentMessage = await sock.sendMessage(groupJid, { image: imageBuffer, ...imageOptions });

                            setTimeout(async () => {
                                await sock.sendMessage(groupJid, { delete: sentMessage.key });
                            }, 300000);
                        } catch (error) {
                            console.error('An error occurred while processing message:', error);
                        }
                    }
                }
            }
        });

        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            if (action === 'add' && participants.length > 0 && id.includes('@g.us')) {
                const groupName = id;
                const welcomeMessage = "Hola, ¿qué tal?";

                try {
                    sentMessage = await sock.sendMessage(id, { text: welcomeMessage });

                    setTimeout(async () => {
                        await sock.sendMessage(id, { delete: sentMessage.key });
                    }, 60000);
                } catch (error) {
                    console.error('An error occurred while sending welcome message:', error);
                }
            }
        });
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

run();
