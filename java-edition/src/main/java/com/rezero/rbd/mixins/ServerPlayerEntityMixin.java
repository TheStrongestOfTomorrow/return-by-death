package com.rezero.rbd.mixins;

import com.rezero.rbd.DeathHandler;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.server.network.ServerPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Mixin into ServerPlayerEntity to intercept onDeath() BEFORE the vanilla
 * drop-inventory / death-message / scoreboard-update logic runs.
 *
 * If DeathHandler.onPlayerDeath() returns true, we cancel the rest of onDeath(),
 * effectively preventing the player from dying and instead rewinding them to
 * their save point.
 */
@Mixin(ServerPlayerEntity.class)
public abstract class ServerPlayerEntityMixin {

    @Inject(method = "onDeath", at = @At("HEAD"), cancellable = true)
    private void rbd$onDeath(DamageSource source, CallbackInfo ci) {
        ServerPlayerEntity self = (ServerPlayerEntity) (Object) this;
        boolean handled = DeathHandler.onPlayerDeath(self, source);
        if (handled) {
            ci.cancel();
        }
    }
}
