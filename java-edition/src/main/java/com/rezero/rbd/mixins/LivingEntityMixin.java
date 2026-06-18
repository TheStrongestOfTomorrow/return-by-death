package com.rezero.rbd.mixins;

import net.minecraft.entity.LivingEntity;
import net.minecraft.entity.damage.DamageSource;
import net.minecraft.server.network.ServerPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Fallback safety net: if any mod or vanilla code path calls LivingEntity.onDeath()
 * directly (bypassing ServerPlayerEntity.onDeath()), we still get a chance to handle it.
 *
 * This is a defensive mixin — under normal gameplay, only ServerPlayerEntityMixin is needed.
 */
@Mixin(LivingEntity.class)
public abstract class LivingEntityMixin {

    @Inject(method = "onDeath", at = @At("HEAD"), cancellable = true)
    private void rbd$onLivingDeath(DamageSource source, CallbackInfo ci) {
        Object self = this;
        if (self instanceof ServerPlayerEntity player) {
            // Defer to DeathHandler. If it handled the death, cancel the rest.
            boolean handled = com.rezero.rbd.DeathHandler.onPlayerDeath(player);
            if (handled) {
                ci.cancel();
            }
        }
    }
}
