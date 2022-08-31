//
//  index.ts
//  Ivy
//
//  Created by Alexandra (@Traurige)
//

import config from '../config.json';
import { ConfigValidator } from './config-validator';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

interface Target {
    id: string;
    type: 'channel' | 'guild';
    name: string;
}

interface MessageContainer {
    total_results: number;
    messages: Array<any>;
}

const API_ENDPOINT: string = 'https://discord.com/api/v10/';
const headers: HeadersInit = {
    'User-Agent' : 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:103.0) Gecko/20100101 Firefox/103.0', // does a real user agent make it less sus?
    'Authorization': config.token
};

let user: any;
let offset: number = 0;
let deletedMessages: number = 0;
let skippedMessages: number = 0;
let failedMessages: number = 0;
let completedTargets: number = 0;

async function main(): Promise<void> {
    validateConfig();

    try {
        const response: Response = await fetch(
            API_ENDPOINT + 'users/@me', {
                headers: headers
            }
        );

        if (response.status === 200) {
            user = await response.json();
        } else {
            console.error(chalk.red('The token in your config seems to be invalid.'));
            process.exit(1);
        }
    } catch {
        console.error('Failed to fetch the user.');
        process.exit(1);
    }

    console.log('\n-------------------------------------------------------');
    console.log(chalk.green('Ivy') + ' by Traurige');
    console.log('Source code: ' + chalk.underline('https://github.com/Traurige/Ivy'));
    console.log('Donations are welcome: ' + chalk.underline('https://ko-fi.com/traurige'));
    console.log('-------------------------------------------------------\n');
    console.log(chalk.yellow('Recommended:') + " Don't interact with your Discord account during the process.");
    console.log(chalk.yellow('Recommended:') + ' Use a VPN or VPS to avoid getting your IP blocked by Cloudflare.');
    console.log(chalk.yellow('Warning:') + ' Using this can get your Discord account blocked by the API.\n');
    console.log('Logged in as ' + chalk.italic(user.username + '#' + user.discriminator) + '.\n');

    console.log('Fetching targets...');
    await deleteMessages(await fetchTargets());

    console.log('\nAll Channels/Guilds have been purged.');
    console.log('Thanks for using ' + chalk.green('Ivy') + '!\n');
}

async function deleteMessages(targets: Array<Target>): Promise<void> {
    const specifiedTargetsCount: number = config.onlyIncludeTheseChannels.length + config.onlyIncludeTheseGuilds.length;
    if (specifiedTargetsCount > 0) {
        if (specifiedTargetsCount === 1) {
            console.log('Specified ' +  chalk.bold('1') + ' target.\n');
        } else {
            console.log('Specified ' +  chalk.bold(String(specifiedTargetsCount)) + ' targets.\n');
        }
    } else {
        if (targets.length === 0) {
            console.log(chalk.yellow('No targets were found.\n'));
            process.exit(0);
        } else if (targets.length === 1) {
            console.log('Found ' +  chalk.bold('1') + ' target. (' + (config.channelsToExclude.length + config.guildsToExclude.length) + ' excluded)\n');
        } else {
            console.log('Found ' + chalk.bold(String(targets.length)) + ' targets. (' + (config.channelsToExclude.length + config.guildsToExclude.length) + ' excluded)\n');
        }
    }

    for (const target of targets) {
        const data: MessageContainer = await fetchMessages(target);
        const totalResults: number = data.total_results;
        let messages: Array<any> = data.messages;

        console.log('-------------------------------------------------------------------');

        if (messages.length === 0) {
            console.log(chalk.yellow('No messages were found in "' + chalk.blue(target.name) + '", moving on.'));
            console.log('-------------------------------------------------------------------');

            prepareForNextTarget(targets);

            continue;
        } else if (messages.length === 1) {
            console.log('Found approximately 1 message in "' + chalk.blue(target.name) + '".\n');
        } else {
            console.log('Found approximately ' + chalk.bold(totalResults) + ' messages in "' + chalk.blue(target.name) + '".\n');
        }

        console.log('Purging messages in "' + chalk.blue(target.name) + '" now.');

        const progressBar: cliProgress.SingleBar = new cliProgress.SingleBar({
            format: chalk.green('{bar}') + ' ' + chalk.bold('{percentage}%') + ' | Elapsed: ' + chalk.bold('{duration_formatted}') + ' | Deleted: ' + chalk.bold('{value}/{total}'),
            barCompleteChar: '#',
            hideCursor: true,
        });
        progressBar.start(totalResults, 0);

        do {
            for (const message of messages) {
                // some messages are an array with one object, i don't know why that is yet
                if (Array.isArray(message)) {
                    for (const _message of message) {
                        messages.push(_message);
                    }
                    continue;
                }

                // messages with the type 1-5 or > 21 are considered system messages and forbidden to be deleted
                if ((message.type >= 1 && message.type <= 5) || message.type > 21) {
                    skippedMessages += 1;
                    continue;
                }

                // skip pinned messages, messages with attachments and messages before a specific date
                if (!config.deletePins && message.pinned ||
                    !config.deleteMessagesWithAttachments && message.attachments.length > 0 ||
                    config.excludeMessagesBeforeDate && message.timestamp < config.excludeMessagesBeforeDate
                ) {
                    skippedMessages += 1;
                    continue;
                }

                let DELETE_ENDPOINT: RequestInfo = API_ENDPOINT;
                if (target.type === 'channel') {
                    DELETE_ENDPOINT += 'channels/' + target.id + '/messages/' + message.id;
                } else {
                    DELETE_ENDPOINT += 'channels/' + message.channel_id + '/messages/' + message.id;
                }

                try {
                    const response: Response = await fetch(
                        DELETE_ENDPOINT, {
                            method: 'DELETE',
                            headers: headers
                        }
                    );

                    if (response.status === 204) {
                        deletedMessages += 1;
                        progressBar.increment();
                    } else if (response.status === 429) {
                        messages.push(message); // add the current message again to try deleting it again later

                        const data: any = await response.json();
                        const delay: number = data.retry_after * 2000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        failedMessages += 1;
                    }
                } catch {
                    messages.push(message);
                }

                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (2000 - 500 + 1) + 500)));
            }

            const data: MessageContainer = await fetchMessages(target);
            messages = data.messages;

            if (messages.length === 0) {
                offset = 0;
            } else {
                offset += 1;
            }
        } while ((deletedMessages + skippedMessages + failedMessages) < (totalResults - 1));

        progressBar.stop();
        console.log('Successful: ' + chalk.bold(deletedMessages) + ' | Skipped: ' + chalk.bold(skippedMessages) + ' | Failed: ' + chalk.bold(failedMessages));
        console.log('-------------------------------------------------------------------');

        prepareForNextTarget(targets);
    }
}

async function fetchMessages(target: Target): Promise<MessageContainer> {
    let MESSAGES_ENDPOINT: RequestInfo = API_ENDPOINT;

    if (target.type === 'channel') {
        MESSAGES_ENDPOINT += 'channels/' + target.id + '/messages/search?author_id=' + user.id
    } else {
        MESSAGES_ENDPOINT += 'guilds/' + target.id + '/messages/search?author_id=' + user.id
    }

    MESSAGES_ENDPOINT += '&include_nsfw=' + config.includeNsfw;
    MESSAGES_ENDPOINT += '&offset=' + offset;

    let totalResults: number = 0;
    let messages: Array<any> = [];
    while (true) {
        try {
            const response: Response = await fetch(
                MESSAGES_ENDPOINT, {
                    headers: headers
                }
            );

            if (response.status === 200) {
                const data: any = await response.json();
                messages = data.messages;
                totalResults = data.total_results;
                break;
            } else if (response.status === 202 || response.status === 429) {
                // 202 === channel/guild hasn't been indexed yet
                // 429 === rate limit exceeded
                const data: any = await response.json();
                const delay: number = data.retry_after * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch {
            console.log('Failed to get the messages. Retrying...');
        }
    }

    return {total_results: totalResults, messages: messages};
}

async function fetchTargets(): Promise<Array<Target>> {
    if (config.onlyIncludeTheseChannels.length > 0 || config.onlyIncludeTheseGuilds.length > 0) {
        return await fetchTargetsForConfiguration();
    } else {
        return await fetchAllTargets();
    }
}

async function fetchTargetsForConfiguration(): Promise<Array<Target>> {
    let targets: Array<Target> = [];

    if (config.onlyIncludeTheseChannels.length > 0) {
        for (const includedChannel of config.onlyIncludeTheseChannels) {
            let name: string = '';

            const channels: Array<any> = await getChannels();
            let channelIds: Array<string> = [];

            for (const channel of channels) {
                channelIds.push(channel.id);
            }

            // if channelIds contains the id, then it's a direct message, else it's a channel in a guild
            if (channelIds.includes(includedChannel)) {
                for (const channel of channels) {
                    if (channel.id === includedChannel) {
                        for (const recipient of channel.recipients) {
                            name += recipient.username + '#' + recipient.discriminator + ', ';
                        }

                        if (name.endsWith(', ')) {
                            name = name.substring(0, name.length - 2);
                        }
                    }
                }
            } else {
                const guilds = await getGuilds();
                for (const guild of guilds) {
                    const guildChannels = await getGuildChannels(guild.id);
                    for (const guildChannel of guildChannels) {
                        if (guildChannel.id === includedChannel) {
                            name = guildChannel.name;
                            break;
                        }
                    }
                    if (name !== '') {
                        break;
                    }
                }
            }

            targets.push({type: 'channel', id: includedChannel, name: name});
        }
    }

    if (config.onlyIncludeTheseGuilds.length > 0) {
        const guilds: Array<any> = await getGuilds();
        for (const includedGuild of config.onlyIncludeTheseGuilds) {
            let name: string = '';

            for (const guild of guilds) {
                if (guild.id === includedGuild) {
                    name = guild.name;
                }
            }

            targets.push({type: 'guild', id: includedGuild, name: name});
        }
    }

    return targets;
}

async function fetchAllTargets(): Promise<Array<Target>> {
    let targets: Array<Target> = [];

    const channels: Array<any> = await getChannels();
    for (const channel of channels) {
        let name: string = '';
        for (const recipient of channel.recipients) {
            name += recipient.username + '#' + recipient.discriminator + ', ';
        }

        if (name.endsWith(', ')) {
            name = name.substring(0, name.length - 2);
        }

        targets.push({type: 'channel', id: channel.id, name: name});
    }

    const guilds: Array<any> = await getGuilds();
    for (const guild of guilds) {
        targets.push({type: 'guild', id: guild.id, name: guild.name});
    }

    return targets;
}

async function getChannels(): Promise<Array<any>> {
    while (true) {
        try {
            const response: Response = await fetch(
                API_ENDPOINT + 'users/@me/channels', {
                    headers: headers
                }
            );

            if (response.status === 200) {
                return await response.json();
            } else if (response.status === 429) {
                const data: any = await response.json();
                const delay: number = data.retry_after * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log(chalk.red('Failed to fetch the channels.'));
                process.exit(1);
            }
        } catch {
            console.log('Failed to fetch the channels. Retrying...');
        }
    }
}

async function getGuilds(): Promise<Array<any>> {
    while (true) {
        try {
            const response: Response = await fetch(
                API_ENDPOINT + 'users/@me/guilds', {
                    headers: headers
                }
            );

            if (response.status === 200) {
                return await response.json();
            } else if (response.status === 429) {
                const data: any = await response.json();
                const delay: number = data.retry_after * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log(chalk.red('Failed to fetch the guilds.'));
                process.exit(1);
            }
        } catch {
            console.log('Failed to fetch the guilds. Retrying...');
        }
    }
}

async function getGuildChannels(guildId: string): Promise<Array<any>> {
    while (true) {
        try {
            const response: Response = await fetch(
                API_ENDPOINT + 'guilds/' + guildId + '/channels', {
                    headers: headers
                }
            );

            if (response.status === 200) {
                return await response.json();
            } else if (response.status === 429) {
                const data: any = await response.json();
                const delay: number = data.retry_after * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log(chalk.red('Failed to fetch the guild channels.'));
                process.exit(1);
            }
        } catch {
            console.log('Failed to fetch the guild channels. Retrying...');
        }
    }
}

function prepareForNextTarget(targets: Array<Target>): void {
    completedTargets += 1;
    if (!targets[completedTargets]) {
        return;
    }

    logRemainingTargets(targets.length, targets[completedTargets].type);

    offset = 0;
    deletedMessages = 0;
    skippedMessages = 0;
    failedMessages = 0;
}

function logRemainingTargets(targetsAmount: number, targetType: string): void {
    if ((targetsAmount - completedTargets) === 1) {
        if (targetType === 'channel') {
            console.log('\n' + chalk.bold('1') + ' Channel left to purge.\n');
        } else {
            console.log('\n' + chalk.bold('1') + ' Guild left to purge.\n');
        }
    } else if ((targetsAmount - completedTargets) > 1) {
        console.log('\n' + chalk.bold((targetsAmount - completedTargets)) + ' Channels/Guilds left to purge.\n');
    }
}

function validateConfig(): void {
    const error = ConfigValidator.validate(config);
    if (error) {
        console.log(chalk.red(error));
        process.exit(1);
    }
}

main().then(_ => process.exit(0));
