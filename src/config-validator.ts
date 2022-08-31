//
//  config-validator.ts
//  Ivy
//
//  Created by Alexandra (@Traurige)
//

export class ConfigValidator {
    public static validate(config: any): string|undefined {
        if (config.token === undefined) {
            return 'The token key is missing in the config.';
        } else {
            if (typeof config.token !== 'string') {
                return 'The token must be a string.';
            }
        }

        if (config.purgeChannels === undefined) {
            return 'The purgeChannels key is missing in the config.';
        } else {
            if (typeof config.purgeChannels !== 'boolean') {
                return "The purgeChannels key's value must be either true or false.";
            }
        }

        if (config.purgeGuilds === undefined) {
            return 'The purgeGuilds key is missing in the config.';
        } else {
            if (typeof config.purgeGuilds !== 'boolean') {
                return "The purgeGuilds key's value must be either true or false.";
            }
        }

        if (config.channelsToExclude === undefined) {
            return 'The channelsToExclude key is missing in the config.';
        } else {
            if (!Array.isArray(config.channelsToExclude)) {
                return "The channelsToExclude key's value must be an array of strings.";
            }
            for (const id of config.channelsToExclude) {
                if (typeof id !== 'string') {
                    return "The channelsToExclude key's value must be an array of strings.";
                }
            }
        }

        if (config.guildsToExclude === undefined) {
            return 'The channelsAndGuildsToExclude key is missing in the config.';
        } else {
            if (!Array.isArray(config.guildsToExclude)) {
                return "The guildsToExclude key's value must be an array of strings.";
            }
            for (const id of config.guildsToExclude) {
                if (typeof id !== 'string') {
                    return "The guildsToExclude key's value must be an array of strings.";
                }
            }
        }

        if (config.onlyIncludeTheseChannels === undefined) {
            return "The onlyIncludeTheseChannels key is missing in the config.";
        } else {
            if (!Array.isArray(config.onlyIncludeTheseChannels)) {
                return "The onlyIncludeTheseChannels key's value must be an array of strings.";
            }
            for (const id of config.onlyIncludeTheseChannels) {
                if (typeof id !== 'string') {
                    return "The onlyIncludeTheseChannels key's value must be an array of strings.";
                }
            }
        }

        if (config.onlyIncludeTheseGuilds === undefined) {
            return 'The onlyIncludeTheseGuilds key is missing in the config.';
        } else {
            if (!Array.isArray(config.onlyIncludeTheseGuilds)) {
                return "The onlyIncludeTheseGuilds key's value must be an array of strings.";
            }
            for (const id of config.onlyIncludeTheseGuilds) {
                if (typeof id !== 'string') {
                    return "The onlyIncludeTheseGuilds key's value must be an array of strings.";
                }
            }
        }

        if (config.includeNsfw === undefined) {
            return 'The includeNsfw key is missing in the config.';
        } else {
            if (typeof config.includeNsfw !== 'boolean') {
                return "The includeNsfw key's value must be either true or false.";
            }
        }

        if (config.deletePins === undefined) {
            return 'The deletePins key is missing in the config.';
        } else {
            if (typeof config.deletePins !== 'boolean') {
                return "The deletePins key's value must be either true or false.";
            }
        }

        if (config.deleteMessagesWithAttachments === undefined) {
            return 'The deleteMessagesWithAttachments key is missing in the config.';
        } else {
            if (typeof config.deleteMessagesWithAttachments !== 'boolean') {
                return "The deleteMessagesWithAttachments key's value must be either true or false.";
            }
        }

        if (config.excludeMessagesBeforeDate === undefined) {
            return 'The excludeMessagesBeforeDate key is missing in the config.';
        } else {
            if (typeof config.excludeMessagesBeforeDate !== 'string') {
                return "The excludeMessagesBeforeDate key's value must be a string.";
            }
        }
    }
}
