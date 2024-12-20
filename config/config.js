// backend/config/config.js
require('dotenv').config();

const config = {
    vps: {
        host: process.env.VPS_HOST,
        username: process.env.VPS_USER,
        password: process.env.VPS_PASS
    },
    server: {
        port: process.env.PORT || 3000
    }
};

module.exports = config;