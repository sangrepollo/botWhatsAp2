const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');

async function getSenderName(sock, jid) {
    try {
        const query = await sock.query({ json: ['query', { type: 'contact', jid: jid }] });

        if (query?.contact?.notify) {
            return query.contact.notify;
        }
    } catch (error) {
        console.error('Error getting sender name:', error);
    }

    return jid;
}

function sustituirMensaje(messageContent) {
    // Reemplaza el emoji 🕑 con ✅
    return messageContent.replace(/🕑/g, '✅');
}

function obtenerEstadoActual(messageContent) {
    const match = messageContent.match(/(?:🕑|✅)(\d+)/);
    return match ? match[1] : null;
}

function obtenerEmojiEstado(estado) {
    return estado === '✅' ? '✅' : '🕑';
}

async function almacenarDatosEnArchivo(messageContent, sender) {
    try {
        if (!messageContent) {
            console.log('Message content is null or undefined.');
            return;
        }

        // Sustituir el emoji 🕑 en el contenido del mensaje
        const mensajeSustituido = sustituirMensaje(messageContent);

        const match = mensajeSustituido.match(/^((107|108|109|110)\d{3})\s*(?:@(\S+))?/);
        if (match) {
            const fileNumber = match[2];
            const fileName = `${fileNumber}.js`;
            const orderNumber = match[1].charAt(3);
            const senderName = match[3] || sender;
            const lastDigits = match[1].slice(-2); // Obtener los últimos dos dígitos
            const contentToAppend = `🕑${fileNumber}(${orderNumber})${lastDigits} ${senderName}\n`; // Cambié 🕑 a ✅ y ajusté el formato

            const fileContent = fs.readFileSync(fileName, 'utf-8');
            const lines = fileContent.trim().split('\n');
            let insertIndex = lines.length;

            for (let i = 0; i < lines.length; i++) {
                const existingOrderMatch = lines[i].match(/\(\d+\)/);
                const existingOrder = existingOrderMatch ? parseInt(existingOrderMatch[0].replace(/[^\d]/g, ''), 10) : 0;

                if (parseInt(orderNumber, 10) < existingOrder) {
                    insertIndex = i;
                    break;
                }
            }

            lines.splice(insertIndex, 0, contentToAppend);
            fs.writeFileSync(fileName, lines.join('\n'));

            console.log('Stored and sorted message in file:', { fileName, content: contentToAppend });
        } else {
            console.log('Message does not match expected format:', { sender, messageContent });
        }
    } catch (error) {
        console.error('Error storing message:', error);
    }
}

function cambiarMensajeDesdeChat(messageContent) {
    try {
        const fechaActual = obtenerFechaActual();

        // El formato esperado del comando sería: !cbp 🕑109(6)12
        const match = messageContent && messageContent.match(/!cbp\s+(🕑(\d{3})\((\d+)\)(\d{2}))/);
        if (match) {
            const fileNumber = match[2];
            const originalOrderNumber = match[3];
            const nuevoMensaje = `✅${fileNumber}(${originalOrderNumber})${match[1].slice(-2)} ✈APROBAD✈️ ️ ️${fechaActual} 📆`;

            // Reemplazar el mensaje original con el nuevo
            const fileName = `${fileNumber}.js`;
            const fileContent = fs.readFileSync(fileName, 'utf-8');
            const nuevasLineas = fileContent.replace(match[1], nuevoMensaje);

            fs.writeFileSync(fileName, nuevasLineas);

            console.log('Mensaje cambiado desde el chat:', { fileName, antiguoMensaje: match[1], nuevoMensaje });
        } else {
            console.log('Comando de cambio de mensaje no válido:', messageContent);
        }
    } catch (error) {
        console.error('Error changing message:', error);
    }
}

function obtenerFechaActual() {
    const fecha = new Date();
    const dia = fecha.getDate().toString().padStart(2, '0');
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0'); // Los meses empiezan desde 0
    const anio = fecha.getFullYear().toString().slice(-2); // Tomar solo los últimos dos dígitos del año

    return `${dia}/${mes}/${anio}`;
}

async function enviarListaDesdeComando(sock, groupJid, fileNumber) {
    try {
        const fileName = `${fileNumber}.js`;

        const fileContent = fs.readFileSync(fileName, 'utf-8');
        const lines = fileContent.trim().split('\n');

        // Crear un mensaje con la lista completa
        const listaCompleta = lines.map(line => `🤞${fileNumber} ${line}`).join('\n');

        // Enviar el mensaje al grupo
        await sock.sendMessage(groupJid, { text: listaCompleta });
    } catch (error) {
        console.error('Error sending list from command:', error);
    }
}

async function enviarRegistroDesdeComando(sock, groupJid, senderName) {
    try {
        const archivos = ['107', '108', '109', '110'];
        let registroEncontrado = false;

        for (const archivo of archivos) {
            const fileName = `${archivo}.js`;
            const fileContent = fs.readFileSync(fileName, 'utf-8');
            const lines = fileContent.trim().split('\n');

            for (const line of lines) {
                if (line.includes(senderName)) {
                    const estadoActual = obtenerEstadoActual(line);
                    const emojiEstado = obtenerEmojiEstado(estadoActual);

                    await sock.sendMessage(groupJid, { text: sustituirMensaje(line.replace(emojiEstado, '🕑')) });
                    registroEncontrado = true;
                    break;
                }
            }

            if (registroEncontrado) {
                break;
            }
        }

        if (!registroEncontrado) {
            await sock.sendMessage(groupJid, { text: 'No se encontró un registro para el usuario.' });
        }
    } catch (error) {
        console.error('Error sending registration from command:', error);
    }
}

// 
async function enviarMensajeRegistroExitoso(sock, groupJid, messageContent) {
    try {
        const registrosCorrectos = (messageContent || '').match(/\b(107|108|109|110)\d{3,}\b/g);
        

        if (registrosCorrectos && registrosCorrectos.length > 0) {
            // Envía mensaje de registro exitoso solo si hay registros correctos en el mensaje
           // await sock.sendMessage(groupJid, { text: '⌛ Registrado ⌛' });

            // Elimina el mensaje después de un minuto
            const options = {};
            const sentMessage = await sock.sendMessage(groupJid, { text: '⌛ *Registrado ⌛ exitosamente* 👌\n\nPuede Consultar su registro con los siguientes !Comandos\n\n!107\n\n!108\n\n!109\n\n!110\n\n!registro \n 🎄🎄🎄' }, options);
            setTimeout(async () => {
                await sock.sendMessage(groupJid, { delete: sentMessage.key });
            }, 90000); // 60000 ms = 1 minuto
        }
    } catch (error) {
        console.error('Error sending successful registration message:', error);
    }
}

async function validarRegistroIncorrecto(sock, groupJid, messageContent) {
    const registrosIncorrectos = (messageContent || '').match(/(?:\b(?!107|108|109|110)\d{6,}\b)/g);

    if (registrosIncorrectos && registrosIncorrectos.length > 0) {
        const respuesta =
            '❌ *Registro Incorrecto* ❌\nDigite números permitidos para los registros de CBP que comienzan con *107, 108, 109, 110*. Ej: *107572* o más dígitos importante que sean *6* o más de *6* 👌';

        // Enviar mensaje de respuesta al grupo
        const options = {};
        const sentMessage = await sock.sendMessage(groupJid, { text: respuesta }, options);
        
        // Elimina el mensaje después de un minuto
        setTimeout(async () => {
            await sock.sendMessage(groupJid, { delete: sentMessage.key });
        }, 90000); // 60000 ms = 1 minuto
    } else {
        // Envía mensaje de registro exitoso si no hay errores
        await enviarMensajeRegistroExitoso(sock, groupJid, messageContent);
    }
}

// 
function eliminarDuplicadosEnArchivos(archivos) {
    try {
        archivos.forEach(archivo => {
            const fileName = `${archivo}.js`;

            const fileContent = fs.readFileSync(fileName, 'utf-8');
            const lines = fileContent.trim().split('\n');

            // Utilizar un conjunto para mantener un registro de las líneas únicas
            const uniqueLines = new Set(lines);

            fs.writeFileSync(fileName, Array.from(uniqueLines).join('\n'));

            console.log('Registros duplicados eliminados en el archivo:', fileName);
        });

        console.log('Proceso completo: registros duplicados eliminados en todos los archivos.');
    } catch (error) {
        console.error('Error eliminando registros duplicados:', error);
    }
}

//

async function run() {
    try {
        console.log('Starting bot');

        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

        const sock = await makeWASocket({
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            auth: state,
        });

        sock.ev.on('creds.update', () => {
            console.log('Credentials updated.');
        });

        sock.ev.on('messages.upsert', async ({ messages }) => {
            for (const message of messages) {
                console.log('Message Received:');
                console.log('Sender:', message.key.remoteJid);
                console.log('Content:', message.message);
                console.log('-------------------');

                const sender = message.key.remoteJid;
                const senderName = message.pushName || (await getSenderName(sock, sender));
                const messageContent = message.message?.conversation;

                // Validar registro incorrecto
                await validarRegistroIncorrecto(sock, sender, messageContent);

                // Sustituir y almacenar el mensaje
                almacenarDatosEnArchivo(messageContent, senderName);

                // Llamar a la función para cambiar el mensaje desde el chat
                cambiarMensajeDesdeChat(messageContent);

                // Verificar si es un comando para enviar la lista
                if (messageContent) {
                    const comandoListaMatch = messageContent.match(/^!(\d{3})/);
                    if (comandoListaMatch) {
                        const fileNumber = comandoListaMatch[1];
                        await enviarListaDesdeComando(sock, sender, fileNumber);
                    }

                    // Verificar si es el comando para enviar el registro
                    const comandoRegistroMatch = messageContent.match(/^!registro/);
                    if (comandoRegistroMatch) {
                        await enviarRegistroDesdeComando(sock, sender, senderName);
                        // Llamar a la función para enviar el mensaje de registro exitoso
                        await enviarMensajeRegistroExitoso(sock, sender, messageContent);
                    }
                } else {
                    console.log('Message content is null or undefined.');
                }

                console.log('Stored message:', { sender, messageContent });
            }
        });

        sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
            try {
                console.log('Received group participants update event:', { id, participants, action });

                if (action === 'add' && participants.length > 0 && id.includes('@g.u')) {
                    // Verificar que el evento se dispare en un grupo público
                    const groupName = id; // Utilizar directamente el ID del grupo
                    // Mensaje de bienvenida personalizado
                    const welcomeMessage = '𝐵𝑖𝑒𝑛𝑣𝑒𝑛𝑖𝑑𝑜 ⛄ *𝐶𝐵𝑃 𝑂𝑛𝑒 107 𝑎 110* 𝑒𝑠𝑡𝑒 𝑚𝑒𝑛𝑠𝑎𝑗𝑒 𝑞𝑢𝑒 𝑢𝑠𝑡𝑒𝑑 𝑒𝑠𝑡á 𝑙𝑒𝑦𝑒𝑛𝑑𝑜 𝑒𝑥𝑝𝑖𝑟𝑎 𝑒𝑛 ⌛ *2* 𝑚𝑖𝑛𝑢𝑡𝑜𝑠.\n𝐶𝑜𝑚𝑎𝑛𝑑𝑜 𝑑𝑒𝑙 𝑏𝑜𝑡 𝑝𝑎𝑟𝑎 𝑠𝑢 𝑟𝑒𝑔𝑖𝑠𝑡𝑟𝑜: "𝐸𝑛𝑣í𝑒 𝑙𝑜𝑠 𝑝𝑟𝑖𝑚𝑒𝑟𝑜𝑠 6 𝑑í𝑔𝑖𝑡𝑜𝑠 𝑑𝑒 𝑠𝑢 𝑐𝑖𝑡𝑎 𝑝𝑟𝑜𝑔𝑟𝑎𝑚𝑎𝑑𝑎. 𝐸𝑗.: *10752764*  𝐸𝑙 🤖𝑏𝑜𝑡 𝑎𝑢𝑡𝑜𝑚á𝑡𝑖𝑐𝑎𝑚𝑒𝑛𝑡𝑒 𝑙𝑜 🖨️𝑟𝑒𝑔𝑖𝑠𝑡𝑟𝑎𝑟á. 𝑆𝑖 𝑑𝑒𝑠𝑒𝑎 𝑐𝑜𝑛𝑠𝑢𝑙𝑡𝑎𝑟 𝑒𝑙 𝑒𝑠𝑡𝑎𝑑𝑜 𝑑𝑒 𝑙𝑜𝑠 🧾𝑟𝑒𝑔𝑖𝑠𝑡𝑟𝑜𝑠, 𝑒𝑛𝑣í𝑒 𝑙𝑜𝑠 𝑠𝑖𝑔𝑢𝑖𝑒𝑛𝑡𝑒𝑠 𝑐𝑜𝑚𝑎𝑛𝑑𝑜𝑠: *!107, !108, !109, !110*. 𝐸𝑠𝑡𝑜𝑠 4.\n\n𝐶𝑢𝑎𝑛𝑑𝑜 𝑢𝑠𝑡𝑒𝑑 𝑡𝑒𝑛𝑔𝑎 𝑙𝑎 𝑐𝑖𝑡𝑎 𝑎𝑝𝑟𝑜𝑏𝑎𝑑𝑎, 𝑒𝑛𝑡𝑜𝑛𝑐𝑒𝑠 𝑖𝑛𝑔𝑟𝑒𝑠𝑎𝑟á 𝑒𝑙 𝑠𝑖𝑔𝑢𝑖𝑒𝑛𝑡𝑒 𝑐𝑜𝑚𝑎𝑛𝑑𝑜. 𝑃𝑎𝑟𝑎 𝑐𝑎𝑚𝑏𝑖𝑎𝑟 𝑒𝑙 𝑒𝑠𝑡𝑎𝑑𝑜 𝑎𝑝𝑟𝑜𝑏𝑎𝑑𝑜 𝑐𝑜𝑛 𝑒𝑙 𝑚𝑖𝑠𝑚𝑜 𝑓𝑜𝑟𝑚𝑎𝑡𝑜, 𝑎𝑞𝑢í 𝑙𝑜 𝑡𝑖𝑒𝑛𝑒 𝑒𝑑𝑖𝑡𝑎𝑑𝑜 𝑦 𝑙𝑜 𝑒𝑛𝑣í𝑎 𝑎𝑙 𝑔𝑟𝑢𝑝𝑜:\n\n👇👇👇👇👇👇👇👇👇\n\n!cbp 🕑109(6)12\n\n𝑈𝑛𝑎 𝑣𝑒𝑧 𝑞𝑢𝑒 𝑑𝑖𝑔𝑖𝑡𝑒 𝑒𝑠𝑡𝑜 𝑐𝑜𝑟𝑟𝑒𝑐𝑡𝑎𝑚𝑒𝑛𝑡𝑒, 𝑐𝑎𝑚𝑏𝑖𝑎𝑟á 𝑠𝑢 𝑒𝑠𝑡𝑎𝑑𝑜\n\n!registro.';

                    // Enviar el mensaje de bienvenida al grupo
                    const options = {};
                    const sentMessage = await sock.sendMessage(id, { text: welcomeMessage }, options);
                    // Eliminar el mensaje después de un minuto
                    setTimeout(async () => {
                        await sock.sendMessage(id, { delete: sentMessage.key });
                    }, 120000); // 60000 ms = 1 minuto
                }
            } catch (error) {
                console.error('Error handling group participants update event:', error);
            }
        });

        sock.ev.on('connection.update', update => {
            try {
                const { connection, lastDisconnect } = update;
                if (connection === 'close') {
                    if (lastDisconnect.error?.output?.statusCode === 401) {
                        console.log('Connection error, reconnecting...');
                        run();
                    }
                } else if (connection === 'open') {
                    console.log('Connected successfully to WhatsApp.');
                }
            } catch (error) {
                console.error('Error handling connection update event:', error);
            }
        });
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

run();
