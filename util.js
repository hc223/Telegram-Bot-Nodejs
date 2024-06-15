

async function queryDatabase(connection, sql, values) {
    try {
        const [rows] = await connection.execute(sql, values);
        return rows;
    } catch (err) {
        console.error('数据库查询错误:', err);
        throw err;
    }
}



// // 格式化日期为中国北京时间标准
// function formatDate(date) {
//     const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai' };
//     return new Date(date).toLocaleString('zh-CN', options);
// }

// 格式化日期为中国北京时间标准，包含小时和分钟
function formatDateCN(date) {
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Shanghai'
    };
    return new Date(date).toLocaleString('zh-CN', options);
}


function formatDate(date) {
    const options = {
        timeZone: 'Asia/Shanghai'
    };
    const formattedDate = new Date(date).toLocaleString('zh-CN', options).slice(0, 19).replace('T', ' ');
    return formattedDate;
}


module.exports = {
    formatDate,
    queryDatabase
};

