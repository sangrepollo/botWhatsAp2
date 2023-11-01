const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baile>
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

                // Verificar si el mensaje proviene de un grupo
                if (message.key.remoteJid.includes('@g.us')) {
                    const groupJid = message.key.remoteJid;
                    const participant = message.key.participant; // Identificador de participante

                    // Inicializar el contador de mensajes para el grupo y el participante
                    if (!messagesQueue[groupJid]) {
                        messagesQueue[groupJid] = {};
                    }
                    if (!messagesQueue[groupJid][participant]) {
                        messagesQueue[groupJid][participant] = 0;
                    }

                    // Incrementar el contador de mensajes para el participante en el grupo
                    messagesQueue[groupJid][participant]++;

                    // Verificar si se alcanzó la cantidad deseada antes de responder
                    if (messagesQueue[groupJid][participant] >= 5) {
                        // Reiniciar el contador de mensajes y responder con un mensaje aleatorio
                        messagesQueue[groupJid][participant] = 0;
                        const randomMessage = mensajes[Math.floor(Math.random() * mensajes.length)];

                        // Enviar el mensaje aleatorio al grupo
                        const imageOptions = {
                            mimetype: 'image/jpeg',
                            filename: 'combo.jpg',
                            caption: randomMessage
                        };
                        const imagePath = './img/combo.jpg';
                        const imageBuffer = fs.readFileSync(imagePath);

                        await sock.sendMessage(groupJid, { image: imageBuffer, ...imageOptions });
                    }
                }
            }
        });
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

run();