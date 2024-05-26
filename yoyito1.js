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
                        const randomMessage = mensajes[Math.floor(Math.random() * mensajes.length)];

                        // Obtener la lista de archivos en el directorio de imágenes
                        const imageFolder = './img/';
                        const imageFiles = fs.readdirSync(imageFolder);

                        // Verificar si la lista de archivos no está vacía
                        if (imageFiles.length > 0) {
                            // Seleccionar una imagen aleatoria de la lista
                            const randomImageFileName = imageFiles[Math.floor(Math.random() * imageFiles.length)];
                            const imageFullPath = imageFolder + randomImageFileName;

                            // Verificar si el path seleccionado es un archivo
                            const stats = fs.statSync(imageFullPath);

                            if (stats.isFile()) {
                                // Es un archivo, entonces puedes leerlo
                                const imageBuffer = fs.readFileSync(imageFullPath);

                                // Enviar la imagen aleatoria al grupo
                                const imageOptions = {
                                    mimetype: 'image/jpeg',
                                    filename: randomImageFileName,
                                    caption: randomMessage
                                };

                                sentMessage = await sock.sendMessage(groupJid, { image: imageBuffer, ...imageOptions });

                                setTimeout(async () => {
                                    await sock.sendMessage(groupJid, { delete: sentMessage.key });
                                }, 60000);
                            } else {
                                console.error('El path no apunta a un archivo válido.');
                            }
                        } else {
                            console.error('No hay imágenes disponibles en el directorio.');
                        }
                    }
                }
            }
        });

        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            if (action === 'add' && participants.length > 0 && id.includes('@g.us')) {
                const groupName = id;
                const welcomeMessage = 
                    "🎉 ¡Bienvenido al Grupo de la Ruleta de la Suerte! 🎉\n\n" +
                    "Este juego se basa en lo siguiente:\n\n" +
                    "Juegas uno o varios números del 1 al 20. Al ocupar las 20 casillas, se le da vuelta a la ruleta. Enviaremos un video donde se muestra quién es el ganador para garantizar transparencia y confianza. Al ganador se le transfiere el dinero del premio.\n\n" +
                    "💸 Las jugadas son las siguientes:\n" +
                    "Inviertes $70 y ganas $900\n" +
                    "Inviertes $95 y ganas $1300\n" +
                    "Inviertes $160 y ganas $2100\n\n" +
                    "Somos serios en este negocio para que ustedes lo sean también. ¡No dejen de jugar con la suerte! 🍀\n\n" +
                    "📜 Las reglas del juego son las siguientes:\n\n" +
                    "- Deben transferir el dinero cuando jueguen el número, si no, no podrán jugar.\n" +
                    "- Hacer captura de pantalla de las transacciones de las jugadas.\n" +
                    "- Cero falta de respeto a los integrantes del grupo, serán expulsados en caso de hacerlo. 📝\n\n" +
                    "💳 Debe transferir a la tarjeta:\n" +
                    "9205 0699 9298 8187\n\n" +
                    "📱 Notificación al:\n" +
                    "*59541842*\n\n" +
                    "Informe en el grupo la realización de la transferencia.\n\n" +
                    "🎰💳🎰💳🎰💳🎰💳🎰💳🎰";

                try {
                    const sentMessage = await sock.sendMessage(id, { text: welcomeMessage });

                    setTimeout(async () => {
                        await sock.sendMessage(id, { delete: sentMessage.key });
                    }, 60000);
                } catch (error) {
                    console.error('An error occurred while sending the welcome message:', error);
                }
            }
        });
    } catch (error) {
        console.error('An error occurred:', error);
        run(); // Retry connection if an error occurs
    }
}

run();
