/*
 * FakeBanByXCV
 * Client-side only. Looks like a real ban.
 */

import { DataStore } from "@api/index";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

const STORAGE_KEY = "FakeBanByXCV_bannedUsers";

const settings = definePluginSettings({
    bannedUsers: {
        type: OptionType.STRING,
        description: "User IDs (comma separated)",
        default: "",
    },
});

async function getBannedSet(): Promise<Set<string>> {
    const stored = (await DataStore.get(STORAGE_KEY)) as string[] | null;
    const fromSettings = settings.store.bannedUsers
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);

    return new Set([...(stored || []), ...fromSettings]);
}

async function saveBanned(ids: Set<string>) {
    const arr = Array.from(ids);
    await DataStore.set(STORAGE_KEY, arr);
    settings.store.bannedUsers = arr.join(", ");
}

function isBanned(userId: string | undefined | null): boolean {
    if (!userId) return false;
    return settings.store.bannedUsers
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
        .includes(userId);
}

export default definePlugin({
    name: "FakeBanByXCV",
    description: "Make specific users appear banned when viewing their profile",
    authors: [{ name: "xcv", id: 0n }],
    settings,

    commands: [
        {
            name: "ban-by-xcv",
            description: "Ban user",
            options: [
                {
                    name: "user",
                    description: "User",
                    type: 6,
                    required: true,
                },
            ],
            execute: async opts => {
                const userOpt = opts.find(o => o.name === "user");
                if (!userOpt) return;

                const userId = typeof userOpt.value === "string" ? userOpt.value : (userOpt.value as any).id;
                const banned = await getBannedSet();
                banned.add(userId);
                await saveBanned(banned);

                // Toast mirip Discord
                showToast("User has been banned", Toasts.Type.SUCCESS);
                return { content: null }; // biar nggak ada reply aneh
            },
        },
        {
            name: "unban-by-xcv",
            description: "Unban user",
            options: [
                {
                    name: "user",
                    description: "User",
                    type: 6,
                    required: true,
                },
            ],
            execute: async opts => {
                const userOpt = opts.find(o => o.name === "user");
                if (!userOpt) return;

                const userId = typeof userOpt.value === "string" ? userOpt.value : (userOpt.value as any).id;
                const banned = await getBannedSet();
                banned.delete(userId);
                await saveBanned(banned);

                showToast("User has been unbanned", Toasts.Type.SUCCESS);
                return { content: null };
            },
        },
    ],

    isBanned,

    patches: [
        // Cegah load profile + lempar error yang sama persis kayak Discord
        {
            find: "getUserProfile",
            replacement: [
                {
                    match: /async getUserProfile\((\i)\){/,
                    replace: `async getUserProfile($1){
                        if(Vencord.Plugins.plugins.FakeBanByXCV?.isBanned?.($1)){
                            const err = new Error("This account has been banned from Discord.");
                            (err as any).code = 50035;
                            (err as any).body = { message: "This account has been banned from Discord." };
                            throw err;
                        }
                    `
                },
                {
                    match: /getUserProfile\((\i)\){/,
                    replace: `getUserProfile($1){
                        if(Vencord.Plugins.plugins.FakeBanByXCV?.isBanned?.($1)){
                            return Promise.reject({
                                message: "This account has been banned from Discord.",
                                code: 50035,
                                body: { message: "This account has been banned from Discord." }
                            });
                        }
                    `
                }
            ]
        },

        // Pastikan error message yang muncul di UI sama
        {
            find: "USER_PROFILE_FETCH_FAILURE",
            replacement: {
                match: /(USER_PROFILE_FETCH_FAILURE:function\((\i)\){)/,
                replace: `$1
                    if(Vencord.Plugins.plugins.FakeBanByXCV?.isBanned?.($2?.userId || $2?.id)){
                        $2.error = {
                            message: "This account has been banned from Discord.",
                            code: 50035
                        };
                    }
                `
            }
        }
    ],

    start() {
        (window as any).FakeBanByXCV = {
            ban: async (id: string) => {
                const s = await getBannedSet();
                s.add(id);
                await saveBanned(s);
            },
            unban: async (id: string) => {
                const s = await getBannedSet();
                s.delete(id);
                await saveBanned(s);
            },
            list: async () => [...await getBannedSet()],
            isBanned,
        };
    },

    stop() {
        delete (window as any).FakeBanByXCV;
    },
});