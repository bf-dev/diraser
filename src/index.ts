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
    type: 'guild' | 'channel' | 'thread' | 'directMessage';
    name: string;
    guildName?: string;
}

interface DataContainer {
    total_results: number;
    messages: Array<any>;
    threads: Array<any>;
}

const API_ENDPOINT: string = 'https://discord.com/api/v10/';
const HTTP_OK: number = 200;
const HTTP_NO_CONTENT: number = 204;
const HTTP_INDEXING: number = 202;
const HTTP_RATE_LIMITED: number = 429;
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

        if (response.status === HTTP_OK) {
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
    console.log(chalk.yellow('Warning:') + ' Use a VPN or VPS to avoid getting your IP blocked by Cloudflare.');
    console.log(chalk.yellow('Warning:') + ' Using this can get your Discord account blocked by the API.');
    console.log(chalk.yellow('Recommended:') + " Don't interact with your Discord account during the process.\n");
    console.log('Logged in as ' + chalk.italic(user.username + '#' + user.discriminator) + '.\n');

    console.log('Fetching targets...');
    await deleteMessages(await fetchTargets());

    console.log('\nEverything has been purged.');
    console.log('Thanks for using ' + chalk.green('Ivy') + '!\n');
}

async function deleteMessages(targets: Array<Target>): Promise<void> {
    const specifiedTargetsCount: number = config.onlyIncludeTheseChannels.length + config.onlyIncludeTheseThreads.length + config.onlyIncludeTheseDirectMessages.length;

    if (specifiedTargetsCount > 0) {
        console.log('Filtering configured targets...\n');
    } else {
        console.log('Using all targets.\n');
    }

    if (targets.length === 0) {
        console.log(chalk.yellow('No targets were found.\n'));
        process.exit(0);
    } else if (targets.length === 1) {
        console.log('Found ' +  chalk.bold('1') + ' target.\n');
    } else {
        console.log('Found ' + chalk.bold(String(targets.length)) + ' targets.\n');
    }

    for (const target of targets) {
        const data: DataContainer = await fetchData(target);
        const totalResults: number = data.total_results;
        let messages: Array<any> = data.messages;

        console.log('-------------------------------------------------------------------');

        if (messages.length === 0) {
            if (target.guildName) {
                console.log(chalk.yellow('No messages were found in "' + chalk.blue(target.name) + '" from "' + chalk.blue(target.guildName) + '", moving on.'));
            } else {
                console.log(chalk.yellow('No messages were found in "' + chalk.blue(target.name) + '", moving on.'));
            }
            console.log('-------------------------------------------------------------------');

            prepareForNextTarget(targets);

            continue;
        } else if (messages.length === 1) {
            console.log('Found approximately 1 message in "' + chalk.blue(target.name) + '".\n');
        } else {
            console.log('Found approximately ' + chalk.bold(totalResults) + ' messages in "' + chalk.blue(target.name) + '".\n');
        }

        if (target.guildName) {
            console.log('Purging messages in "' + chalk.blue(target.name) + '" from "' + chalk.blue(target.guildName) + '" now.');
        } else {
            console.log('Purging messages in "' + chalk.blue(target.name) + '" now.');
        }

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

                // continue with the next target if the message is older than the specified date
                if (config.excludeMessagesBeforeDate && message.timestamp < config.excludeMessagesBeforeDate) {
                    skippedMessages += totalResults - deletedMessages;
                    break;
                }

                // skip pinned messages, messages with attachments and messages before a specific date
                if (!config.deletePins && message.pinned ||
                    !config.deleteMessagesWithAttachments && message.attachments.length > 0
                ) {
                    skippedMessages += 1;
                    continue;
                }

                let DELETE_ENDPOINT: RequestInfo = API_ENDPOINT;
                if (target.type === 'guild') {
                    DELETE_ENDPOINT += 'channels/' + message.channel_id + '/messages/' + message.id;
                } else {
                    DELETE_ENDPOINT += 'channels/' + target.id + '/messages/' + message.id;
                }

                try {
                    const response: Response = await fetch(
                        DELETE_ENDPOINT, {
                            method: 'DELETE',
                            headers: headers
                        }
                    );

                    if (response.status === HTTP_NO_CONTENT) {
                        deletedMessages += 1;
                        progressBar.increment();
                    } else if (response.status === HTTP_RATE_LIMITED) {
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

            const data: DataContainer = await fetchData(target);
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

async function fetchData(target: Target): Promise<DataContainer> {
    let MESSAGES_ENDPOINT: RequestInfo = API_ENDPOINT;

    if (target.type === 'guild') {
        MESSAGES_ENDPOINT += 'guilds/' + target.id + '/messages/search?author_id=' + user.id;
    } else {
        MESSAGES_ENDPOINT += 'channels/' + target.id + '/messages/search?author_id=' + user.id;
    }

    MESSAGES_ENDPOINT += '&include_nsfw=' + config.includeNsfw;
    MESSAGES_ENDPOINT += '&offset=' + offset;

    let totalResults: number = 0;
    let messages: Array<any> = [];
    let threads: Array<any> = [];
    while (true) {
        try {
            const response: Response = await fetch(
                MESSAGES_ENDPOINT, {
                    headers: headers
                }
            );

            if (response.status === HTTP_OK) {
                const data: any = await response.json();
                totalResults = data.total_results;
                messages = data.messages;
                threads = data.threads;
                break;
            } else if (response.status === HTTP_INDEXING || response.status === HTTP_RATE_LIMITED) {
                const data: any = await response.json();
                const delay: number = data.retry_after * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                break;
            }
        } catch {
            console.log('Failed to get the messages. Retrying...');
        }
    }

    return {total_results: totalResults, messages: messages, threads: threads};
}

async function fetchTargets(): Promise<Array<Target>> {
    let targets: Array<Target>;

    if (!config.purgeGuilds ||
        !config.purgeChannels ||
        !config.purgeThreads ||
        !config.purgeDirectMessages ||
        config.guildsToExclude.length > 0 ||
        config.channelsToExclude.length > 0 ||
        config.threadsToExclude.length > 0 ||
        config.directMessagesToExclude.length > 0 ||
        config.onlyIncludeTheseGuilds.length > 0 ||
        config.onlyIncludeTheseChannels.length > 0 ||
        config.onlyIncludeTheseThreads.length > 0 ||
        config.onlyIncludeTheseDirectMessages.length > 0
    ) {
        targets = await fetchTargetsForConfiguration();
    } else {
        targets = await fetchAllTargets();
    }

    // threads are purged first
    const threadTargets: Array<Target> = targets.filter(target => target.type === 'thread');
    const channelTargets: Array<Target> = targets.filter(target => target.type === 'channel');
    const directMessageTargets: Array<Target> = targets.filter(target => target.type === 'directMessage');

    targets = threadTargets.concat(channelTargets).concat(directMessageTargets);

    return targets;
}

async function fetchAllTargets(): Promise<Array<Target>> {
    let targets: Array<Target> = [];

    const guilds: Array<Target> = await fetchGuilds();
    for (const guild of guilds) {
        targets = targets.concat(await fetchGuildChannels(guild));
        targets = targets.concat(await fetchGuildThreads(guild));
    }

    targets = targets.concat(await fetchDirectMessages());

    return targets;
}

async function fetchTargetsForConfiguration(): Promise<Array<Target>> {
    const guildsToExclude: Array<string> = config.guildsToExclude;
    const channelsToExclude: Array<string> = config.channelsToExclude;
    const threadsToExclude: Array<string> = config.threadsToExclude;
    const directMessagesToExclude: Array<string> = config.directMessagesToExclude;
    const onlyIncludeTheseGuilds: Array<string> = config.onlyIncludeTheseGuilds;
    const onlyIncludeTheseChannels: Array<string> = config.onlyIncludeTheseChannels;
    const onlyIncludeTheseThreads: Array<string> = config.onlyIncludeTheseThreads;
    const onlyIncludeTheseDirectMessages: Array<string> = config.onlyIncludeTheseDirectMessages;

    let guilds: Array<Target> = [];
    let channels: Array<Target> = [];
    let threads: Array<Target> = [];
    let directMessages: Array<Target> = [];

    if (config.purgeGuilds) {
        guilds = await fetchGuilds();
        filterExcludedTargets(guilds, guildsToExclude);
        if (onlyIncludeTheseGuilds.length > 0) {
            guilds = filterIncludedTargets(guilds, onlyIncludeTheseGuilds);
        }

        for (const guild of guilds) {
            if (config.purgeChannels) {
                channels = channels.concat(await fetchGuildChannels(guild));
            }
            if (config.purgeThreads) {
                threads = threads.concat(await fetchGuildThreads(guild));
            }
        }

        filterExcludedTargets(channels, channelsToExclude);
        filterExcludedTargets(threads, threadsToExclude);

        if (onlyIncludeTheseChannels.length > 0) {
            channels = filterIncludedTargets(channels, onlyIncludeTheseChannels);
        }
        if (onlyIncludeTheseThreads.length > 0) {
            threads = filterIncludedTargets(threads, onlyIncludeTheseThreads);
        }
    }

    if (config.purgeDirectMessages) {
        directMessages = await fetchDirectMessages();

        filterExcludedTargets(directMessages, directMessagesToExclude);

        if (onlyIncludeTheseDirectMessages.length > 0) {
            directMessages = filterIncludedTargets(directMessages, onlyIncludeTheseDirectMessages);
        }
    }

    return guilds.concat(channels).concat(threads).concat(directMessages);
}

async function fetchGuilds(): Promise<Array<Target>> {
    while (true) {
        try {
            const response: Response = await fetch(
                API_ENDPOINT + 'users/@me/guilds', {
                    headers: headers
                }
            );

            if (response.status === HTTP_OK) {
                const _guilds: Array<any> = await response.json();
                const guildsToExclude: Array<string> = config.guildsToExclude;

                let guilds: Array<Target> = [];
                for (const _guild of _guilds) {
                    if (!guildsToExclude.includes(_guild.id)) {
                        guilds.push({type: 'guild', id: _guild.id, name: _guild.name});
                    }
                }

                return guilds;
            } else if (response.status === HTTP_RATE_LIMITED) {
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

async function fetchGuildChannels(guild: Target): Promise<Array<Target>> {
    while (true) {
        try {
            const response: Response = await fetch(
                API_ENDPOINT + 'guilds/' + guild.id + '/channels', {
                    headers: headers
                }
            );

            if (response.status === HTTP_OK) {
                const _channels: Array<any> = await response.json();
                const channelsToExclude: Array<string> = config.channelsToExclude;

                let channels: Array<Target> = [];
                for (const _channel of _channels) {
                    if (!channelsToExclude.includes(_channel.id) && _channel.type === 0) {
                        channels.push({type: 'channel', id: _channel.id, name: _channel.name, guildName: guild.name});
                    }
                }

                return channels;
            } else if (response.status === HTTP_RATE_LIMITED) {
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

async function fetchGuildThreads(guild: Target): Promise<Array<Target>> {
    let threads: Array<Target> = [];

    const data: DataContainer = await fetchData(guild);

    let _threads: Array<Target> = data.threads;
    if (_threads) {
        for (const _thread of _threads) {
            const threadsToExclude: Array<string> = config.threadsToExclude;
            if (!threadsToExclude.includes(_thread.id)) {
                threads.push({type: 'thread', id: _thread.id, name: _thread.name, guildName: guild.name});
            }
        }
    }

    return threads;
}

async function fetchDirectMessages(): Promise<Array<Target>> {
    while (true) {
        try {
            const response: Response = await fetch(
                API_ENDPOINT + 'users/@me/channels', {
                    headers: headers
                }
            );

            if (response.status === HTTP_OK) {
                const _directMessages: Array<any> = await response.json();
                const directMessagesToExclude: Array<string> = config.directMessagesToExclude;

                let directMessages: Array<Target> = [];
                for (const _directMessage of _directMessages) {
                    if (!directMessagesToExclude.includes(_directMessage.id)) {
                        let name: string = '';
                        for (const recipient of _directMessage.recipients) {
                            name += recipient.username + '#' + recipient.discriminator + ', ';
                        }

                        if (name.endsWith(', ')) {
                            name = name.substring(0, name.length - 2);
                        }

                        directMessages.push({type: 'directMessage', id: _directMessage.id, name: name});
                    }
                }
                return directMessages;
            } else if (response.status === HTTP_RATE_LIMITED) {
                const data: any = await response.json();
                const delay: number = data.retry_after * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.log(chalk.red('Failed to fetch the direct messages.'));
                process.exit(1);
            }
        } catch {
            console.log('Failed to fetch the direct messages. Retrying...');
        }
    }
}

function filterExcludedTargets(targets: Array<Target>, excludedTargets: Array<string>): Array<Target> {
    for (const excludedTarget of excludedTargets) {
        const index: number = targets.findIndex(target => target.id === excludedTarget);
        if (index > -1) {
            targets.splice(index, 1);
        }
    }

    return targets;
}

function filterIncludedTargets(targets: Array<Target>, includedTargets: Array<string>): Array<Target> {
    for (let i = targets.length - 1; i >= 0; i--) {
        const target: Target = targets[i];
        if (!includedTargets.includes(target.id)) {
            targets.splice(i, 1);
        }
    }

    return targets;
}

function prepareForNextTarget(targets: Array<Target>): void {
    completedTargets += 1;
    if (!targets[completedTargets]) {
        return;
    }

    if ((targets.length - completedTargets) === 1) {
        console.log('\n1 Target is left to purge.\n');
    } else {
        console.log('\n' + chalk.bold((targets.length - completedTargets)) + ' targets are left to purge.\n');
    }

    offset = 0;
    deletedMessages = 0;
    skippedMessages = 0;
    failedMessages = 0;
}

function validateConfig(): void {
    const error = ConfigValidator.validate(config);
    if (error) {
        console.log(chalk.red(error));
        process.exit(1);
    }
}

main().then(_ => process.exit(0));
