const mysql = require('mysql2/promise');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

const {formatDate,queryDatabase} = require('./util')


const crypto = require('crypto');

function generateReferralCode() {
    return crypto.randomBytes(6).toString('hex');
}

dotenv.config();


const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectionLimit: process.env.DB_CONNECTION_LIMIT,
};

const botToken = process.env.BOT_TOKEN;

const bot = new TelegramBot(botToken, { polling: true });

const pool = mysql.createPool(dbConfig);
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID

const checkExpireInterval = 3600 * 1000; 
setInterval(checkExpire, checkExpireInterval);


async function checkExpire() {
    try {
        const conn = await pool.getConnection();

        const expiredUsers = await queryDatabase(conn, 'SELECT * FROM users WHERE expire_time IS NOT NULL AND expire_time <= NOW()');

        for (const user of expiredUsers) {
            await downgradeToNormalUser(user.user_id);
        }

        conn.release();
    } catch (err) {
        console.error('会员过期检查错误:', err);
    }
}

async function start(msg, inviteCode = null) {
    const chatId = msg.chat.id;
    try {
        if (msg.chat.type === 'private') {
            const conn = await pool.getConnection();

            const [user] = await queryDatabase(conn, 'SELECT * FROM users WHERE user_id = ?', [msg.from.id]);

            if (!user) {
                if (!msg.from.username) {
                    await bot.sendMessage(chatId, '⛔用户名不能为空，请设置用户名后再注册。');
                    conn.release();
                    return;
                }

                const now = new Date();
                const register_date_str = now.toISOString();
                
                await registerUser(conn, msg.from.id, msg.from.username, register_date_str, inviteCode);

                // 仅生成邀请码，不显示
             //   await generateAndSaveInviteCode(msg.from.id);

                await bot.sendMessage(chatId, '欢迎您使用！请使用 /help 命令查看用户信息。');
            } else {
                await help(msg);
            }

            conn.release();
        }
    } catch (err) {
        console.error('start 函数错误:', err);
    }
}

async function generateAndSaveInviteCode(userId) {
    const conn = await pool.getConnection();
    try {
     
        const existingInvite = await queryDatabase(conn, 'SELECT code FROM invites WHERE user_id = ?', [userId]);
        if (existingInvite.length > 0) {
            
            return existingInvite[0].code;
        }
        
        
        const code = generateReferralCode();
        
        await queryDatabase(conn, 'INSERT INTO invites (user_id, code) VALUES (?, ?)', [userId, code]);
        
        return code;
    } catch (err) {
        console.error('生成邀请码错误:', err);
        throw err;
    } finally {
        conn.release();
    }
}

async function checkChannelMembership(userId) {
    try {
        const response = await bot.getChatMember(TELEGRAM_CHANNEL_ID, userId);
        const memberStatuses = ['creator', 'administrator', 'member'];
        return response && memberStatuses.includes(response.status);
    } catch (error) {
        console.error('Error checking channel membership:', error);
        return false;
    }
}
async function activate(code, user_id) {
    try {
        const conn = await pool.getConnection();
        const [row] = await queryDatabase(conn, `SELECT * FROM active_codes WHERE code = ? AND used = 0`, [code]);

        // if (!row) {
        //     throw '激活码无效或已使用';
        // }

        if (row.type === 1) {
            
            await updateUserGroup(user_id, 2);

            
            if (row.expire_days) {
                const now = new Date();
                const expireDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + row.expire_days);
                await updateUserExpireTime(user_id, expireDate);
            }
        } else if (row.type === 0) {
            
            const userPoints = await getUserPoints(user_id);
            const totalPoints = userPoints + row.points;
            await updateUserPoints(user_id, totalPoints); 
        }

        await queryDatabase(conn, 'UPDATE active_codes SET used = 1 WHERE id = ?', [row.id]);

        conn.release();
    } catch (err) {
        throw err;
    }
}

async function updateUserPoints(user_id, points) {
    try {
        const conn = await pool.getConnection();
        await queryDatabase(conn, 'UPDATE users SET score = score + ? WHERE user_id = ?', [points, user_id]);
        conn.release();
    } catch (err) {
        console.error('更新用户积分错误:', err);
        throw err;
    }
}

async function updateUserExpireTime(userId, expireTime) {
    try {
       // const formattedExpireTime = expireTime ? new Date(expireTime).toISOString().slice(0, 19).replace('T', ' ') : null;

        const formattedExpireTime = formatDate(expireTime);
        

        const conn = await pool.getConnection();
        await queryDatabase(conn, 'UPDATE users SET expire_time = ? WHERE user_id = ?', [formattedExpireTime, userId]);

        conn.release();
    } catch (err) {
        console.error('更新用户过期时间错误:', err);
    }
}

async function getUserPoints(user_id) {
    try {
        const conn = await pool.getConnection();
        const [row] = await queryDatabase(conn, 'SELECT score FROM users WHERE user_id = ?', [user_id]);
        conn.release();

        if (row) {
            return row.score;
        } else {
            return 0; // 如果用户不存在，默认积分为0
        }
    } catch (err) {
        console.error('获取用户积分错误:', err);
        throw err;
    }
}

async function updateUserGroup(userId, newGroup) {
    try {
        const conn = await pool.getConnection();
        await queryDatabase(conn, 'UPDATE users SET user_group = ? WHERE user_id = ?', [newGroup, userId]);
        conn.release();
    } catch (err) {
        console.error('更新用户组错误:', err);
    }
}


async function downgradeToNormalUser(userId) {
    try {
        const conn = await pool.getConnection();
        await updateUserGroup(userId, 1);
        await updateUserExpireTime(userId, null);
        conn.release();
    } catch (err) {
        console.error('降级为普通用户错误:', err);
    }
}


async function registerUser(connection, user_id, username, register_date, invite_code = null) {
    try {

        // const formattedRegisterDate = new Date(register_date).toISOString().slice(0, 19).replace('T', ' ');
        const formattedRegisterDate = formatDate(register_date);
        


        await connection.execute('INSERT INTO users (user_id, username, score, register_date, user_group, expire_time) VALUES (?, ?, 0, ?, 1, ?)', [user_id, username, formattedRegisterDate, null]);


        if (invite_code) {
 
            const [invite] = await queryDatabase(connection, 'SELECT * FROM invites WHERE code = ?', [invite_code]);


            if (invite) {

                await queryDatabase(connection, 'INSERT INTO invite_logs (inviter_id, invited_id) VALUES (?, ?)', [invite.user_id, user_id]);

                await updateUserPoints(invite.user_id, 1);

                // console.log(`用户 ${invite.user_id} 因邀请用户 ${user_id} 获得了 1 积分。`);

                await queryDatabase(connection, 'UPDATE invites SET invite_count = invite_count + 1 WHERE user_id = ?', [invite.user_id]);
            } else {

                console.log('邀请码无效。');
            }
        }


        console.log(`用户 ${user_id} 已注册。`);
    } catch (err) {

        console.error('注册用户错误:', err);
        throw err;
    }
}


async function help(msg) {
    const chatType = msg.chat.type;
    const nickname = msg.from.first_name; // 获取用户的昵称

    const privateHelpMessage =
        `你好 \`${nickname}\`！`;

    let helpMessage = privateHelpMessage; // 默认为私聊帮助信息

    if (chatType !== 'private') {
        helpMessage = '⛔对不起，帮助信息只能在私聊中使用。';
    }

    // Create Inline Keyboard with buttons for /checkin, /info, tutorial, and customer service commands
    const keyboard = {
        inline_keyboard: [
            [
                { text: '👛簽到積分', callback_data: 'checkin' },
                { text: '👤用戶信息', callback_data: 'info' }
            ],
            [
                { text: '📔使用教程', url: 'https://telegra.ph/' },
                // { text: '在线客服', url: '' }
            ],
            [
                { text:'🇨🇳简体语言包', url:'https://t.me/setlanguage/zhcncc'},
                { text:'🇭🇰繁体语言包', url:'https://t.me/setlanguage/zh-hant-raw'}
            ]
        ]
    };

    // Send help message with inline keyboard
    bot.sendMessage(msg.chat.id, helpMessage, { reply_markup: JSON.stringify(keyboard), parse_mode: 'MarkdownV2' }).catch((error) => {
        console.error('发送帮助信息错误:', error);
        bot.sendMessage(msg.chat.id, '无法发送帮助信息。');
    });
}


async function info(msg) {
    const user_id = msg.from.id;
    const chatId = msg.chat.id;
  //  const nickname = msg.from.first_name; // 获取用户的昵称



    const isMember = await checkAndNotifyChannelMembership(user_id, chatId, bot);
    if (!isMember) return;

    try {
        const conn = await pool.getConnection();

        // 查询用户信息和邀请数量
        const query = 'SELECT u.*, i.invite_count FROM users u LEFT JOIN invites i ON u.user_id = i.user_id WHERE u.user_id = ?';
        const [rows] = await conn.execute(query, [user_id]);

        conn.release(); // 释放连接

        if (rows.length > 0) {
            const user = rows[0];
            let userGroupText = '*🚩用戶組:* 普通用戶';
            if (user.user_group === 0) {
                userGroupText = '*🏳️用戶組:* 封禁用戶';
            } else if (user.user_group === 2) {
                userGroupText = `*🏳️‍🌈用戶組:* 會員用戶\n*⏲會員過期時間：*\`${user.expire_time ? formatDate(user.expire_time) : '無'}\``;
            }

            // const usernames = `你好 \`${nickname}\``;
            const userIdText = `*🆔您的用戶 ID 是：*\`${user.user_id}\``;
            const scoreText = `*💵您的積分是：*${user.score}`;
            const registerDateText = `🕐*註冊日期：*\`${formatDate(user.register_date)}\``;
            const inviteCountText = `*🧮邀请数量:* ${user.invite_count || 0}`; // 如果邀请数量为空，则默认为0

            const infoMessage = `${userIdText}\n${scoreText}\n${registerDateText}\n${userGroupText}\n${inviteCountText}`.replace(/-/g, '\\-');

            bot.sendMessage(msg.chat.id, infoMessage, { parse_mode: 'MarkdownV2' });
        } else {
            const notRegisteredMessage = '您還未註冊賬戶，請使用 /start 命令創建賬戶。';
            bot.sendMessage(msg.chat.id, notRegisteredMessage);
        }
    } catch (err) {
        console.error('数据库查询错误:', err);
        const errorMessage = '查询用户信息时发生错误。';
        bot.sendMessage(msg.chat.id, errorMessage);
    }
}

async function checkIn(msg) {
    const user_id = msg.from.id;
    const chatId = msg.chat.id;
    const replyMessageId = msg.message_id;


    // 检查用户是否已在指定频道中
    const isMember = await checkAndNotifyChannelMembership(user_id, chatId, bot);
    if (!isMember) return;


    try {
        const conn = await pool.getConnection();

        // 检查用户是否在 'users' 表中已注册
        const selectUserQuery = 'SELECT user_id, score FROM users WHERE user_id = ?';
        const [userRows, userFields] = await conn.execute(selectUserQuery, [user_id]);

        if (userRows.length === 0) {
            // 用户尚未注册，发送未注册提示消息
            const notRegisteredMessage = '您還未註冊賬戶，請使用 /start 命令創建賬戶。';
            await bot.sendMessage(msg.chat.id, notRegisteredMessage);
            conn.release();
            return; // 如果用户未注册，退出函数，不继续执行签到逻辑
        }

        const now = new Date();
        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);

        const selectQuery = 'SELECT * FROM user_checkins WHERE user_id = ?';
        const [rows, fields] = await conn.execute(selectQuery, [user_id]);

        if (rows.length > 0) {
            const lastCheckInTime = new Date(rows[0].last_checkin_time);
            const timeDifferenceInHours = (beijingTime - lastCheckInTime) / (1000 * 60 * 60);

            if (timeDifferenceInHours >= 24) {
                const updateQuery = 'UPDATE user_checkins SET last_checkin_time = ? WHERE user_id = ?';
                await conn.execute(updateQuery, [beijingTime, user_id]);

                const updateUserScoreQuery = 'UPDATE users SET score = score + 1 WHERE user_id = ?';
                await conn.execute(updateUserScoreQuery, [user_id]);

                const successMessage = `\n👛獲得 1 積分👛\n💵当前积分为：${userRows[0].score + 1}💵`;
                bot.sendMessage(msg.chat.id, successMessage,{ reply_to_message_id: replyMessageId });
            } else {
                const remainingTimeMessage = `⚠️您已經簽到過了⚠️`;
                bot.sendMessage(msg.chat.id, remainingTimeMessage,{ reply_to_message_id: replyMessageId });
            }
        } else {
            const insertQuery = 'INSERT INTO user_checkins (user_id, last_checkin_time) VALUES (?, ?)';
            await conn.execute(insertQuery, [user_id, beijingTime]);

            const updateUserScoreQuery = 'UPDATE users SET score = score + 1 WHERE user_id = ?';
            await conn.execute(updateUserScoreQuery, [user_id]);

            const successMessage = `👛獲得 1 積分👛\n💵当前积分为：${userRows[0].score + 1}💵`;
            bot.sendMessage(msg.chat.id, successMessage,{ reply_to_message_id: replyMessageId });
        }

        conn.release();
    } catch (err) {
        console.error('数据库查询错误:', err);
    }
}



async function checkAndNotifyChannelMembership(userId, chatId, bot) {
    const isMember = await checkChannelMembership(userId);
    if (!isMember) {
        await bot.sendMessage(chatId, '⛔️您必须先加入 xxxxx 频道才能使用⛔️', {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '加入频道',
                            url: 'https://t.me/xxxxxx'
                        }
                    ]
                ]
            }
        });
        return false;
    }
    return true;
}



async function invites(msg){
    const user_id = msg.from.id;
    const replyMessageId = msg.message_id;

    try {
        const conn = await pool.getConnection();

                        // 仅生成邀请码，不显示
        
          await generateAndSaveInviteCode(msg.from.id);

        // 检查用户是否在 'users' 表中已注册
        const selectUserQuery = 'SELECT user_id, score FROM users WHERE user_id = ?';
        const [userRows, userFields] = await conn.execute(selectUserQuery, [user_id]);

        if (userRows.length === 0) {
            // 用户尚未注册，发送未注册提示消息
            const notRegisteredMessage = '您還未註冊賬戶，請使用 /start 命令創建賬戶。';
            await bot.sendMessage(msg.chat.id, notRegisteredMessage,{ reply_to_message_id: replyMessageId });
            conn.release();
            return; // 如果用户未注册，退出函数，不继续执行签到逻辑
        }

        // 用户已注册，查询邀请信息
        const selectInviteQuery = 'SELECT code FROM invites WHERE user_id = ?';
        const [inviteRows, inviteFields] = await conn.execute(selectInviteQuery, [user_id]);

        if (inviteRows.length === 0) {
            // 如果用户没有邀请信息，发送相应提示消息
            const noInviteMessage = '您尚未生成邀请链接，请先生成邀请链接后再次尝试。';
            await bot.sendMessage(msg.chat.id, noInviteMessage,{ reply_to_message_id: replyMessageId });
        } else {
            // 如果用户有邀请信息，发送邀请链接
            const inviteCode = inviteRows[0].code;
            const inviteLink = `https://t.me/RootSGK_bot?start=${inviteCode}`;
            const inviteMessage = `*您的邀请链接是：*\n\`${inviteLink}\``;
            await bot.sendMessage(msg.chat.id, inviteMessage,{ reply_to_message_id: replyMessageId, parse_mode: 'MarkdownV2' });
        }

        conn.release();
    } catch (err) {
        console.error('数据库查询错误:', err);
    }
}




bot.onText(/^\/key$/, async (msg) => {
    const replyMessageId = msg.message_id;

    await bot.sendMessage(msg.chat.id, '*请输入兑换码: *\n格式为：\`/key 123456\`', { reply_to_message_id: replyMessageId , parse_mode: 'MarkdownV2'});
});

bot.onText(/^\/key (.+)$/, async (msg, match) => {
    const code = match[1];
    const user_id = msg.from.id;
    const replyMessageId = msg.message_id;
    

    try {
        await activate(code, user_id);
        bot.sendMessage(msg.chat.id, '*🏆︎激活成功🏆︎*', { reply_to_message_id: replyMessageId , parse_mode: 'MarkdownV2'});
    } catch  {
        bot.sendMessage(msg.chat.id, '*⚠️激活失敗⚠️*\n\n', { reply_to_message_id: replyMessageId , parse_mode: 'MarkdownV2'});
    }
});

bot.onText(/\/invite/, invites);

bot.onText(/\/start(?: (.+))?$/, async (msg, match) => {
    const inviteCode = match[1] ? match[1].trim() : null;
    await start(msg, inviteCode);
});



bot.onText(/\/help/, help);

bot.onText(/\/checkin$/, checkIn);


bot.on('polling_error', (err) => console.error('轮询错误:', err));


bot.on('callback_query', async (query) => {
    const msg = query.message;
    const data = query.data;
    const userId = query.from.id;

    try {
        if (data === 'checkin') {
            await checkIn({ chat: { id: userId }, from: { id: userId } });
        } else if (data === 'info') {
            await info({ chat: { id: userId }, from: { id: userId } });
        }
    } catch (error) {
        console.error('处理回调查询错误:', error);
    }
});

console.log("start");

