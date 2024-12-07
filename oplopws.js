import axios from 'axios';
import readline from 'readline';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import ping from 'ping';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const tokenFolder = path.join(__dirname, 'tokens');

if (!fs.existsSync(tokenFolder)) {
    fs.mkdirSync(tokenFolder);
}

const getSavedTokens = () => {
    const tokens = [];
    if (fs.existsSync(tokenFolder)) {
        const files = fs.readdirSync(tokenFolder);
        files.forEach(file => {
            if (file.endsWith('.txt')) {
                const token = fs.readFileSync(path.join(tokenFolder, file), 'utf-8').trim();
                tokens.push(token);
            }
        });
    }
    return tokens;
};

const saveToken = (token) => {
    const tokenCount = fs.readdirSync(tokenFolder).length;
    const tokenFileName = `token_${tokenCount + 1}.txt`;
    fs.writeFileSync(path.join(tokenFolder, tokenFileName), token, 'utf-8');
};

const calculateQuality = async () => {
    const target = 'api.openloop.so';
    try {
        const result = await ping.promise.probe(target);
        if (result.alive) {
            const latency = result.time;
            const quality = Math.max(1, Math.min(100, Math.round(100 - latency)));
            return quality;
        } else {
            return 50;
        }
    } catch (error) {
        return 50;
    }
};

const createLogger = (accountId) => {
    const logPrefix = `[Account ${accountId}]`;
    return {
        log: (message) => {
            const line = `${logPrefix} ${message}`;
            console.log(line);
            logToFile(accountId, message);
        },
        info: (message) => {
            const line = `${logPrefix} ${message}`;
            console.log(chalk.cyan(line));
            logToFile(accountId, message);
        },
        success: (message) => {
            const line = `${logPrefix} ${message}`;
            console.log(chalk.green(line));
            logToFile(accountId, message);
        },
        warning: (message) => {
            const line = `${logPrefix} ${message}`;
            console.log(chalk.yellow(line));
            logToFile(accountId, message);
        },
        error: (message) => {
            const line = `${logPrefix} ${message}`;
            console.log(chalk.red(line));
            logToFile(accountId, message);
        }
    };
};

const countdown = (seconds, accountId) => {
    return new Promise((resolve) => {
        let timer = seconds;
        const interval = setInterval(() => {
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(`[Account ${accountId}] ⏳ Waiting for (${String(timer).padStart(2, '0')}) second.`);
            timer -= 1;
            if (timer < 0) {
                clearInterval(interval);
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                resolve();
            }
        }, 1000);
    });
};

const logToFile = (accountId, message) => {
    const logFolder = path.join(__dirname, 'logs');
    if (!fs.existsSync(logFolder)) {
        fs.mkdirSync(logFolder);
    }
    
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logFolder, `account_${accountId}_${today}.log`);
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    fs.appendFileSync(logFile, logMessage);
};

const processAccount = async (bearerToken, accountId, totalAccounts, nextAccount) => {
    const headers = {
        Authorization: `Bearer ${bearerToken}`
    };

    try {
        console.log(chalk.yellow(`[Account ${accountId}] 🌐 Fetching Bandwidth Info...`));
        const bandwidthInfo = await axios.get('https://api.openloop.so/bandwidth/info', { headers });
        const currentPoints = bandwidthInfo.data.data.balances.POINT;
        console.log(chalk.green(`[Account ${accountId}] ✅ Bandwidth Info Retrieved Successfully!`));
        console.log(chalk.cyan(`[Account ${accountId}] Success ✔ || Balance: ${currentPoints.toFixed(2)}`));

        await countdown(5, accountId);

        console.log(chalk.yellow(`\n[Account ${accountId}] 🌐 Testing network latency to api.openloop.so...`));
        const quality = await calculateQuality();
        console.log(chalk.green(`[Account ${accountId}] ✅ Latency measured: ${quality} ms`));
        console.log(chalk.cyan(`[Account ${accountId}] 🌟 Calculated Quality: ${quality}`));

        console.log(chalk.yellow(`\n[Account ${accountId}] 🌐 Fetching Bandwidth Share...`));
        const bandwidthShare = await axios.post(
            'https://api.openloop.so/bandwidth/share',
            { quality },
            { headers }
        );
        console.log(chalk.green(`[Account ${accountId}] ✅ Bandwidth Share Retrieved Successfully!`));
        console.log(
            chalk.cyan(
                `[Account ${accountId}] Success ✔ || Points: ${bandwidthShare.data.data.balances.POINT.toFixed(2)}`
            )
        );

        await countdown(5, accountId);
        
        console.log(chalk.blue.bold(`\n[Account ${accountId}] ⏳ Next requests cycle...\n`));
        nextAccount(); 
    } catch (error) {
        console.log(chalk.red(`\n[Account ${accountId}] ❌ Error fetching data:`));
        if (error.response) {
            console.error(chalk.redBright(JSON.stringify(error.response.data, null, 2)));
        } else {
            console.error(chalk.redBright(error.message));
        }
        await countdown(10, accountId); 
        nextAccount();
    }
};

const processAccountsSequentially = async (tokens) => {
    let currentIndex = 0;
    const totalAccounts = tokens.length;

    const processNextAccount = async () => {
        const token = tokens[currentIndex];
        const accountId = currentIndex + 1;

        await processAccount(token, accountId, totalAccounts, () => {
            currentIndex = (currentIndex + 1) % totalAccounts; 
            processNextAccount(); 
        });
    };

    processNextAccount(); 
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askForNewToken = () => {
    return new Promise((resolve) => {
        rl.question(chalk.magenta('Input new bearer token (or type "n" for start): '), (answer) => {
            resolve(answer);
        });
    });
};

const showLogo = () => {
    console.log(chalk.blue(`
██     ██ ██ ███    ██ ███████ ███    ██ ██ ██████  
██     ██ ██ ████   ██ ██      ████   ██ ██ ██   ██ 
██  █  ██ ██ ██ ██  ██ ███████ ██ ██  ██ ██ ██████  
██ ███ ██ ██ ██  ██ ██      ██ ██  ██ ██ ██ ██      
 ███ ███  ██ ██   ████ ███████ ██   ████ ██ ██      
`));
    console.log("Join our Telegram channel: https://t.me/winsnip");
    console.log("");
};

const start = async () => {
    showLogo();
    const savedTokens = getSavedTokens();
    console.log(chalk.green(`🔑 Found ${savedTokens.length} token saved`));

    while (true) {
        const answer = await askForNewToken();
        if (answer.toLowerCase() === 'n') {
            break;
        }
        if (answer.trim()) {
            saveToken(answer.trim());
            console.log(chalk.green('✅ New token success saved!'));
        }
    }

    const allTokens = getSavedTokens();
    if (allTokens.length === 0) {
        console.log(chalk.red('❌ Nothing token saved. Please add min 1 token.'));
        rl.close();
        return;
    }

    console.log(chalk.green(`\n🚀 Running script for ${allTokens.length} account sequentially...\n`));
    rl.close();

    processAccountsSequentially(allTokens);
};

start();
