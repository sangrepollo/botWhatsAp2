const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const messages = require('./tximsg.js'); // Importa los mensajes aleatorios

async function run() {
    try {
        console.log('starting');
        const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
        let sock;

        const establishConnection = async () => {
            sock = await makeWASocket({
                printQRInTerminal: true,
                logger: P({ level: 'silent' }),
                auth: state
            });

            sock.ev.on('connection.update', update => {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    if (lastDisconnect.error && lastDisconnect.error.hasOwnProperty('output')) {
                        console.log("Connection error, reconnecting...");
                        establishConnection();
                    } else if (lastDisconnect.error && lastDisconnect.error.output.statusCode === DisconnectReason.unknown) {
                        console.log("Disconnected, reconnecting...");
                        establishConnection();
                    }
                } else if (connection === 'open') {
                    console.log("Connected successfully to WhatsApp.");
                }
            });

            sock.ev.on('creds.update', saveCreds);
        };

        await establishConnection();

        // Lista de JIDs de grupos en los que el bot debe funcionar
        const groupJIDs = [
            '120363196225200573@g.us',
            '120363195365646017@g.us'
        ];

        // Variables para rastrear el estado del grupo
        let groupIsOpen = false;
        let groupAnnouncementSent = false;

        // Función para permitir que solo los administradores envíen mensajes en todos los grupos
        async function allowAdminsToSendMessages(sock) {
            for (const groupJID of groupJIDs) {
                await sock.groupSettingUpdate(groupJID, 'announcement');
            }
        }

        // Función para permitir que todos los miembros envíen mensajes en todos los grupos
        async function allowEveryoneToSendMessages(sock) {
            for (const groupJID of groupJIDs) {
                await sock.groupSettingUpdate(groupJID, 'not_announcement');
            }
        }

        // Función para anunciar que los grupos están cerrados en todos los grupos
        async function announceGroupClosed(sock) {
            if (!groupAnnouncementSent) {
                for (const groupJID of groupJIDs) {
                    await sock.sendMessage(groupJID, { text: '*🌃Buenas Noches 🦉 se cierran los servicios de la agencia, recuerde que estamos de 8:00 AM a 12:00 AM. Si quiere solicitar cualquier *servicio fuera de esa hora debe reservar 🏃su Taxi antes. Saludos*.👋' });
                }
                groupAnnouncementSent = true;
            }
        }

        // Función para anunciar que los grupos están abiertos en todos los grupos
        async function announceGroupOpen(sock) {
            if (!groupAnnouncementSent) {
                for (const groupJID of groupJIDs) {
                    await sock.sendMessage(groupJID, { text: '*Quedan abiertos los servicios de la agencia🚖, solicite su taxi ahora con nosotros.* *Estamos activos de 8:00 AM a 12:00 AM🕣. Recuerde que si quiere un taxi fuera de ese horario debe reservarlo con antelación. Buenos días🌅 de parte del equipo de Daily Taxi*.' });
                }
                groupAnnouncementSent = true;
            }
        }

        // Función para verificar si el grupo debe abrirse
        function shouldOpenGroup() {
            const currentTime = new Date();
            const hours = currentTime.getHours();

            // El grupo estará abierto si la hora actual es entre las 8 AM (8) y las 11:59 PM (23)
            return hours >= 8 && hours <= 23;
        }

        // Manejo de usuarios que mencionan "MLC"
        const usersMlc = {};

        // Verificar si el grupo debe abrirse o cerrarse cada minuto
        setInterval(() => {
            if (shouldOpenGroup()) {
                if (!groupIsOpen) {
                    groupIsOpen = true;
                    groupAnnouncementSent = false;
                    allowEveryoneToSendMessages(sock);
                    announceGroupOpen(sock);
                }
            } else {
                if (groupIsOpen) {
                    groupIsOpen = false;
                    groupAnnouncementSent = false;
                    allowAdminsToSendMessages(sock);
                    announceGroupClosed(sock);
                }
            }
        }, 60000); // 1 minuto

        // Responder si alguien menciona "taxi" en un grupo
        sock.ev.on('messages.upsert', ({ messages }) => {
            messages.forEach(message => {
                try {
                    if (message.key.remoteJid.includes('@g.us')) {
                        const text = message.message.conversation ||
                                    (message.message.imageMessage && message.message.imageMessage.caption) ||
                                    (message.message.extendedTextMessage && message.message.extendedTextMessage.text);
                        if (text && text.toLowerCase().includes('taxi')) {
                            const chatJid = message.key.remoteJid;
                            if (!usersMlc[chatJid] || (Date.now() - usersMlc[chatJid] >= 15000)) {
                                const responseMessage = {
                                    text: '🚕🚕🚕🚕\n*EN Breve Le Atendera un agente*.'
                                };
                                sock.sendMessage(chatJid, responseMessage);
                                usersMlc[chatJid] = Date.now();
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                }
            });
        });

        // Enviar un mensaje aleatorio en todos los grupos cada 5 minutos
        setInterval(() => {
            const randomIndex = Math.floor(Math.random() * messages.length);
            const randomMessage = messages[randomIndex];
            for (const groupJID of groupJIDs) {
                sock.sendMessage(groupJID, { text: randomMessage });
            }
        }, 39600000); // 11 horas 
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

run();
