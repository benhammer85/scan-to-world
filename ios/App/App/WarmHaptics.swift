import Foundation
import UIKit
import Capacitor
import CoreHaptics

/// Haptics for Warm to the Touch by the phone's own engine (Core Haptics): a continuous rumble whose
/// strength and grain can change while it plays (the lava pouring), and single taps of any strength
/// and sharpness (a heartbeat, rock landing). Used from `src/volcano/native.ts` as `WarmHaptics`;
/// without it (in a browser, or an older build) the game falls back to the plain Haptics plugin.
@objc(WarmHapticsPlugin)
public class WarmHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WarmHapticsPlugin"
    public let jsName = "WarmHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rumble", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tap", returnType: CAPPluginReturnPromise)
    ]

    private var engine: CHHapticEngine?
    private var rumbler: CHHapticAdvancedPatternPlayer?
    private var rumbling = false

    override public func load() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        do {
            let made = try CHHapticEngine()
            made.playsHapticsOnly = true
            made.isAutoShutdownEnabled = true
            // The engine can be stopped or reset by the system (a call, the app in the background):
            // forget the rumble's player, and it's made again the next time it's wanted.
            made.resetHandler = { [weak self] in
                self?.rumbler = nil
                self?.rumbling = false
                try? self?.engine?.start()
            }
            made.stoppedHandler = { [weak self] _ in
                self?.rumbler = nil
                self?.rumbling = false
            }
            engine = made
        } catch {
            engine = nil
        }
    }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["value": engine != nil])
    }

    /// The rumble: a strength of 0 stops it; above that it plays, or goes on playing, at that
    /// strength (0 to 1) and grain (0, soft and deep, to 1, crisp).
    @objc func rumble(_ call: CAPPluginCall) {
        let strength = Float(max(0, min(1, call.getDouble("strength") ?? 0)))
        let grain = Float(max(0, min(1, call.getDouble("grain") ?? 0.3)))
        guard let engine = engine else { call.resolve(); return }
        do {
            if strength < 0.01 {
                if rumbling { try rumbler?.stop(atTime: CHHapticTimeImmediate) }
                rumbling = false
                call.resolve()
                return
            }
            try engine.start()
            if rumbler == nil {
                let event = CHHapticEvent(eventType: .hapticContinuous, parameters: [
                    CHHapticEventParameter(parameterID: .hapticIntensity, value: 1),
                    CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
                ], relativeTime: 0, duration: 30)
                let pattern = try CHHapticPattern(events: [event], parameters: [])
                let player = try engine.makeAdvancedPlayer(with: pattern)
                player.loopEnabled = true
                rumbler = player
                rumbling = false
            }
            try rumbler?.sendParameters([
                CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: strength, relativeTime: 0),
                CHHapticDynamicParameter(parameterID: .hapticSharpnessControl, value: grain - 0.3, relativeTime: 0)
            ], atTime: CHHapticTimeImmediate)
            if !rumbling {
                try rumbler?.start(atTime: CHHapticTimeImmediate)
                rumbling = true
            }
        } catch {
            rumbler = nil
            rumbling = false
        }
        call.resolve()
    }

    /// One tap: its strength (0 to 1) and sharpness (0, a soft thump, to 1, a crisp click).
    @objc func tap(_ call: CAPPluginCall) {
        let strength = Float(max(0, min(1, call.getDouble("strength") ?? 0.5)))
        let sharpness = Float(max(0, min(1, call.getDouble("sharpness") ?? 0.5)))
        guard let engine = engine else { call.resolve(); return }
        do {
            try engine.start()
            let event = CHHapticEvent(eventType: .hapticTransient, parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: strength),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
            ], relativeTime: 0)
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            try engine.makePlayer(with: pattern).start(atTime: CHHapticTimeImmediate)
        } catch {
            // (Nothing felt this once.)
        }
        call.resolve()
    }
}

/// The game's view: Capacitor's own, with the haptics plugin above registered on it.
class WarmBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WarmHapticsPlugin())
    }
}
