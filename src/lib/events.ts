import { nowInSeconds, requiredEnvVar } from "lw-test-module";
import { NostrEvent } from "@nostr-dev-kit/ndk";

export function buildUserCreditsEvent(pubkey: string, credits: number): NostrEvent {
    return {
        pubkey: requiredEnvVar("NOSTR_PUBLIC_KEY"),
        kind: 31111,
        content: '',
        created_at: nowInSeconds(),
        tags: [
            ['d', `credits:${pubkey}`],
            ['amount', credits.toString()]
        ]
    }
}

export function buildBuyCreditEvent(pubkey: string, amount: number): NostrEvent {
    return {
        pubkey: requiredEnvVar("NOSTR_PUBLIC_KEY"),
        kind: 1112,
        content: '',
        created_at: nowInSeconds(),
        tags: [
            ['t', `buy:credits:${pubkey}`],
            ['amount', amount.toString()]
        ]
    }
}

export function buildLogEvent(subscriptionId: string, status: string, response: string | null, attempt: number): NostrEvent {
    return {
        pubkey: requiredEnvVar("NOSTR_PUBLIC_KEY"),
        kind: 1112,
        content: JSON.stringify({
            status,
            response,
            attempt
        }),
        created_at: nowInSeconds(),
        tags: [
            ['t', `log:${subscriptionId}`],
        ]
    }
}

export function buildSubscriptionsEvent(content: string, userPubKey: string): NostrEvent {
    return {
        pubkey: requiredEnvVar("NOSTR_PUBLIC_KEY"),
        kind: 31111,
        created_at: nowInSeconds(),
        tags: [['d', `subscriptions:${userPubKey}`]],
        content,
    }
}