import { connectToTempRelays, getWriteNDK, requiredEnvVar } from "lw-test-module";

export function getWriteRelaySet() {
    return connectToTempRelays(requiredEnvVar("NOSTR_RELAYS").split(','), getWriteNDK());
}