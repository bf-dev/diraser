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

const API_ENDPOINT: string = 'https://discord.com/api/v10/';
const headers: HeadersInit = {
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

    console.log('\n-------------------------------------------------------');
    console.log(chalk.green('Ivy') + ' by Traurige');
    console.log('Source code: ' + chalk.underline('https://github.com/Traurige/Ivy'));
    console.log('Donations are welcome: ' + chalk.underline('https://ko-fi.com/traurige'));
    console.log('-------------------------------------------------------\n');
    console.log(chalk.yellow('Recommended:') + ' Use a VPN or VPS to avoid getting your IP blocked by Cloudflare.');
    console.log(chalk.yellow('Warning:') + ' Unlikely, but using this can get your Discord account blocked by the API.\n');
    console.log('Logged in as ' + user.username + '#' + user.discriminator + '...\n');

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
        console.log('-------------------------------------------------------------------');
        console.log('Fetching messages in "' + chalk.blue(target.name) + '"... (this may take some time)');
        let messages: Array<any> = await fetchMessages(target);

        if (messages.length === 0) {
            console.log(chalk.yellow('No messages were found, moving on.'));
            console.log('-------------------------------------------------------------------');

            completedTargets += 1;
            logRemainingTargets(targets.length, target.type);

            offset = 0;
            skippedMessages = 0;
            failedMessages = 0;

            continue;
        } else if (messages.length === 1) {
            console.log('Found 1 message.\n');
        } else {
            console.log('Found ' + chalk.bold(String(messages.length)) + ' messages.\n');
        }

        console.log('Purging messages in "' + chalk.blue(target.name) + '"...');

        const progressBar = new cliProgress.SingleBar({
            format: chalk.green('{bar}') + ' {percentage}% | ETA: {eta}s | Deleted: {value}/{total}',
            barCompleteChar: '#',
            hideCursor: true
        });
        progressBar.start(messages.length, 0);

        for (const message of messages) {
            let DELETE_ENDPOINT: RequestInfo = API_ENDPOINT;
            if (target.type === 'channel') {
                DELETE_ENDPOINT += 'channels/' + target.id + '/messages/' + message.id;
            } else {
                DELETE_ENDPOINT += 'channels/' + message.channel_id + '/messages/' + message.id;
            }

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
                const delay: number = data.retry_after * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                failedMessages += 1;
            }

            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (2000 - 500 + 1) + 500)));
        }

        console.log('\nSuccessful: ' + chalk.bold(String(deletedMessages)) + ' | Failed: ' + chalk.bold(String(failedMessages)));
        console.log('-------------------------------------------------------------------');

        completedTargets += 1;
        logRemainingTargets(targets.length, target.type);

        offset = 0;
        skippedMessages = 0;
        failedMessages = 0;
    }
}

async function fetchMessages(target: Target): Promise<Array<any>> {
    let validMessages: Array<any> = [];

    while (true) {
        let MESSAGES_ENDPOINT: RequestInfo = API_ENDPOINT;

        if (target.type === 'channel') {
            MESSAGES_ENDPOINT += 'channels/' + target.id + '/messages/search?author_id=' + user.id
        } else {
            MESSAGES_ENDPOINT += 'guilds/' + target.id + '/messages/search?author_id=' + user.id
        }

        MESSAGES_ENDPOINT += '&include_nsfw=' + config.includeNsfw;
        MESSAGES_ENDPOINT += '&offset=' + offset;

        const response: Response = await fetch(
            MESSAGES_ENDPOINT, {
                headers: headers
            }
        );

        if (response.status === 200) {
            const data: any = await response.json();
            const messages: Array<any> = data.messages;

            if (messages.length === 0) {
                break;
            }

            for (let message of messages) {
                message = message[0];

                // messages with the type 1-5 or > 21 are considered system messages and forbidden to be deleted
                if ((message.type >= 1 && message.type <= 5) || message.type > 21) {
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

                validMessages.push(message);
            }

            offset += messages.length;
        } else if (response.status === 202 || response.status === 429) {
            // 202 === channel/guild hasn't been indexed yet
            // 429 === rate limit exceeded
            const data: any = await response.json();
            const delay: number = data.retry_after * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (2000 - 500 + 1) + 500)));
    }

    return validMessages;
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
        const response: Response = await fetch(
            API_ENDPOINT + 'users/@me/channels', {
                headers: headers
            }
        );

        if (response.status !== 200) {
            console.log(chalk.red('Failed to fetch the channels.'));
            process.exit(1);
        } else {
            const channels: Array<any> = await response.json();
            for (const includedChannel of config.onlyIncludeTheseChannels) {
                let name: string = '';

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

                targets.push({type: 'channel', id: includedChannel, name: name});
            }
        }
    }

    if (config.onlyIncludeTheseGuilds.length > 0) {
        const response: Response = await fetch(
            API_ENDPOINT + 'users/@me/guilds', {
                headers: headers
            }
        );

        if (response.status !== 200) {
            console.log(chalk.red('Failed to fetch the guilds.'));
            process.exit(1);
        } else {
            const guilds: Array<any> = await response.json();

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
    }

    return targets;
}

async function fetchAllTargets(): Promise<Array<Target>> {
    let targets: Array<Target> = [];

    let TARGET_ENDPOINTS: Array<string> = [];
    if (config.purgeChannels) {
        TARGET_ENDPOINTS.push(API_ENDPOINT + 'users/@me/channels');
    }
    if (config.purgeGuilds) {
        TARGET_ENDPOINTS.push(API_ENDPOINT + 'users/@me/guilds');
    }

    // get all channel and guild ids
    for (const targetEndpoint of TARGET_ENDPOINTS) {
        const response: Response = await fetch(
            targetEndpoint, {
                headers: headers
            }
        );

        if (response.status !== 200) {
            console.log(chalk.red('Failed to get the list of channels or guilds. Try again in a few seconds.'));
            process.exit(1);
        } else {
            const data: any = await response.json();
            const channelsToExclude: Array<string> = config.channelsToExclude;
            const guildsToExclude: Array<string> = config.guildsToExclude;

            for (const target of data) {
                // skip excluded channels and guilds
                if (channelsToExclude.includes(target.id) || guildsToExclude.includes(target.id)) {
                    continue;
                }

                if (targetEndpoint.endsWith('channels')) {
                    let name: string = '';
                    for (const recipient of target.recipients) {
                        name += recipient.username + '#' + recipient.discriminator + ', ';
                    }

                    if (name.endsWith(', ')) {
                        name = name.substring(0, name.length - 2);
                    }

                    targets.push({type: 'channel', id: target.id, name: name});
                } else {
                    targets.push({type: 'guild', id: target.id, name: target.name});
                }
            }
        }
    }

    return targets;
}

function logRemainingTargets(targetsAmount: number, targetType: string): void {
    if ((targetsAmount - completedTargets) === 1) {
        if (targetType === 'channel') {
            console.log('\n1 Channel left to purge.\n');
        } else {
            console.log('\n1 Guild left to purge.\n');
        }
    } else if ((targetsAmount - completedTargets) > 1) {
        console.log('\n' + (targetsAmount - completedTargets) + ' Channels/Guilds left to purge.\n');
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
