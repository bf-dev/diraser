//
//  index.ts
//  Ivy
//
//  Created by Alexandra (@Traurige)
//

import config from '../config.json';
import { ConfigValidator } from './ConfigValidator';
import colors from 'colors';
import cliProgress from 'cli-progress';

interface Target {
    type: 'channel' | 'guild';
    id: string;
}

const API_ENDPOINT: string = 'https://discord.com/api/v10/';
const headers: HeadersInit = {
    'Authorization': config.token
};

let user: any;
let targets: Array<Target> = [];
let completedTargets: number = 0;
let totalDeletedMessages: number = 0; // only used for the result
let totalSkippedMessages: number = 0; // only used for the result
let totalFailedMessages: number = 0; // only used for the result
let skippedMessages: number = 0; // used at runtime
let failedMessages: number = 0; // used at runtime

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
        console.error(colors.red('The token in your config seems to be invalid.'));
        process.exit(1);
    }

    console.log('\n-------------------------------------------------------');
    console.log(colors.green('Ivy') + ' by Traurige');
    console.log('Source code: ' + colors.underline('https://github.com/Traurige/Ivy'));
    console.log('Donations are welcome: ' + colors.underline('https://ko-fi.com/traurige'));
    console.log('-------------------------------------------------------\n');
    console.log(colors.yellow('Recommended:') + ' Use a VPN or VPS to avoid getting your IP blocked by Cloudflare.');
    console.log(colors.yellow('Warning:') + ' Unlikely, but using this can get your Discord account blocked by the API.\n');
    console.log('Purging messages for ' + user.username + '#' + user.discriminator + '...\n');

    await deleteMessages(await getTargets());
}

async function deleteMessages(targets: Array<Target>): Promise<void> {
    if (targets.length === 0) {
        console.log(colors.yellow('No targets found.'));
        process.exit(0);
    }

    for (const target of targets) {
        const progressBar = new cliProgress.SingleBar({
            format: colors.green('{bar}') + ' {percentage}% | Deleted: {value} | Indexed: {total}',
            barCompleteChar: '#',
            hideCursor: true
        });

        progressBar.start(0, 0);

        let messages: any = await getMessages(target);
        progressBar.setTotal(messages.length);

        while (messages.length > (skippedMessages + failedMessages)) {
            for (let message of messages) {
                message = message[0];

                // skip pinned messages, messages with attachments and messages before a specific date
                if (!config.deletePins && message.pinned ||
                    !config.deleteMessagesWithAttachments && message.attachments.length > 0 ||
                    config.excludeMessagesBeforeDate && message.timestamp < config.excludeMessagesBeforeDate
                ) {
                    skippedMessages += 1;
                    totalSkippedMessages += 1;
                    continue;
                }

                let DELETE_ENDPOINT: RequestInfo = API_ENDPOINT;
                if (target.type === 'channel') {
                    DELETE_ENDPOINT += 'channels/' + target.id + '/messages/' + message.id;
                } else if (target.type === 'guild') {
                    DELETE_ENDPOINT += 'channels/' + message.channel_id + '/messages/' + message.id;
                }

                const response: Response = await fetch(
                    DELETE_ENDPOINT, {
                        method: 'DELETE',
                        headers: headers
                    }
                );

                if (response.status === 204) {
                    totalDeletedMessages += 1;
                    progressBar.increment();
                } else if (response.status === 429) {
                    const data: any = await response.json();
                    const delay: number = data.retry_after * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    failedMessages += 1;
                    totalFailedMessages += 1;
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            messages = await getMessages(target);
            progressBar.start(messages.length, 0);
        }

        completedTargets += 1;
        if ((targets.length - completedTargets) === 1) {
            if (target.type === 'channel') {
                console.log('\n1 Channel left to purge.\n');
            } else {
                console.log('\n1 Guild left to purge.\n');
            }
        } else if ((targets.length - completedTargets) > 1) {
            console.log('\n' + (targets.length - completedTargets) + ' Channels/Guilds left to purge.\n');
        } else {
            console.log('\n\nAll Channels/Guilds have been purged. (' + totalDeletedMessages + ' deleted, ' + totalSkippedMessages + ' skipped, ' + totalFailedMessages + ' failed)');
            console.log('Thanks for using ' + colors.green('Ivy') + '!\n');
        }

        skippedMessages = 0;
        failedMessages = 0;
    }
}

async function getMessages(target: Target): Promise<Array<any>> {
    let MESSAGES_ENDPOINT: RequestInfo = API_ENDPOINT;

    if (target.type === 'channel') {
        MESSAGES_ENDPOINT += 'channels/' + target.id + '/messages/search?author_id=' + user.id
    } else {
        MESSAGES_ENDPOINT += 'guilds/' + target.id + '/messages/search?author_id=' + user.id
    }

    MESSAGES_ENDPOINT += '&include_nsfw=' + config.includeNsfw;

    const response: Response = await fetch(
        MESSAGES_ENDPOINT, {
            headers: headers
        }
    );

    if (response.status === 200) {
        const data: any = await response.json();
        return data.messages;
    } else if (response.status === 202 || response.status === 429) {
        // 202 === channel/guild hasn't been indexed yet
        // 429 === rate limit exceeded
        if (response.status === 202) {
            targets.push(target); // add the current target to the upcoming targets again to try again later
        }

        const data: any = await response.json();
        const delay: number = data.retry_after * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    return [];
}

async function getTargets(): Promise<Array<Target>> {
    let TARGET_ENDPOINTS: Array<string> = [];

    // only include channels and guilds from the config
    if (config.onlyIncludeTheseChannels.length > 0 || config.onlyIncludeTheseGuilds.length > 0) {
        for (const channel of config.onlyIncludeTheseChannels) {
            targets.push({type: 'channel', id: channel});
        }

        for (const guild of config.onlyIncludeTheseGuilds) {
            targets.push({type: 'guild', id: guild});
        }

        return targets;
    }

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
            console.log(colors.red('Failed to get the list of channels or guilds. Try again in a few seconds.'));
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
                    targets.push({type: 'channel', id: target.id});
                } else {
                    targets.push({type: 'guild', id: target.id});
                }
            }
        }
    }

    return targets;
}

function validateConfig(): void {
    const error = ConfigValidator.validate(config);
    if (error) {
        console.log(colors.red(error));
        process.exit(1);
    }
}

main().then(_ => process.exit(0));
