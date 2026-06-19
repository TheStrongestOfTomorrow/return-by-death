package com.rezero.rbd;

import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import net.minecraft.util.random.RandomGenerator;

import java.util.concurrent.ThreadLocalRandom;

/**
 * DeathQuotes - sends a random Subaru-style quote to the player when they die.
 *
 * Flavor only - no mechanical effect. Just makes the death feel more dramatic
 * and on-theme with Re:Zero.
 */
public final class DeathQuotes {

    /** Subaru-style quotes shown on death. */
    private static final String[] QUOTES = {
        "I have to die again...",
        "From zero. I'll restart from zero.",
        "This time, I'll save them.",
        "Return... by death.",
        "I'll definitely save you. No matter how many times I have to die.",
        "The Witch is watching.",
        "Once more, from zero.",
        "I can't give up. Not yet.",
        "Even if it costs me my life...",
        "Just one more loop. I can do this.",
        "I died again. But that's fine. I can try again.",
        "If I die, I can start over. That's the only power I have.",
        "I'm not afraid of dying. I'm afraid of not being able to save anyone.",
        "The scent of the Witch grows stronger.",
        "This pain is just the price of going back."
    };

    private DeathQuotes() {}

    /** Send a random Subaru-style quote to the dying player. */
    public static void sendRandomQuote(ServerPlayerEntity player) {
        String quote = QUOTES[ThreadLocalRandom.current().nextInt(QUOTES.length)];
        player.sendMessage(Text.literal("\u00a7d\u00a7o\"" + quote + "\"\u00a7r\u00a77 \u2014 Natsuki Subaru"), false);
    }
}
