package com.rezero.rbd;

import net.fabricmc.api.ClientModInitializer;

/**
 * Client-side entrypoint for Return By Death.
 *
 * Currently a stub — the mod is server-authoritative. Add client-side logic here
 * (e.g. death screen overlay, screen shake, particle effects) if needed.
 */
public class ReturnByDeathClient implements ClientModInitializer {

    @Override
    public void onInitializeClient() {
        ReturnByDeathMod.LOGGER.info("[Return By Death] Client initialized.");
    }
}
