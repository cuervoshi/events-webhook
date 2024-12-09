import { connectToTempRelays, getWriteNDK, requiredEnvVar } from "lw-test-module";

export function getWriteRelaySet() {
    return connectToTempRelays(requiredEnvVar("NOSTR_WRITE_RELAYS").split(','), getWriteNDK());
}