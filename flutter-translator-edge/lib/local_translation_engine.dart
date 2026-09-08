import 'dart:async';

import 'package:flutter/services.dart';

import 'models.dart';

class NativeCapabilities {
  const NativeCapabilities({
    required this.localRuntimeLinked,
    required this.stt,
    required this.llm,
    required this.tts,
    required this.vad,
  });

  final bool localRuntimeLinked;
  final String stt;
  final String llm;
  final String tts;
  final String vad;

  factory NativeCapabilities.fromMap(Map<Object?, Object?> map) {
    return NativeCapabilities(
      localRuntimeLinked: map['localRuntimeLinked'] == true,
      stt: map['stt']?.toString() ?? 'not linked',
      llm: map['llm']?.toString() ?? 'not linked',
      tts: map['tts']?.toString() ?? 'not linked',
      vad: map['vad']?.toString() ?? 'not linked',
    );
  }
}

class LocalTranslationEngine {
  LocalTranslationEngine()
      : _control = const MethodChannel(
          'ai.eburon.flutter_translator_edge/control',
        ),
        _eventChannel = const EventChannel(
          'ai.eburon.flutter_translator_edge/events',
        );

  final MethodChannel _control;
  final EventChannel _eventChannel;
  Stream<EngineEvent>? _events;

  Stream<EngineEvent> get events => _events ??= _eventChannel
      .receiveBroadcastStream()
      .map((dynamic raw) => EngineEvent.fromMap(
            Map<Object?, Object?>.from(raw as Map),
          ));

  Future<NativeCapabilities> capabilities() async {
    try {
      final raw = await _control.invokeMethod<Map<Object?, Object?>>(
        'capabilities',
      );
      return NativeCapabilities.fromMap(raw ?? const <Object?, Object?>{});
    } on MissingPluginException {
      return const NativeCapabilities(
        localRuntimeLinked: false,
        stt: 'Android host not generated',
        llm: 'Android host not generated',
        tts: 'Android host not generated',
        vad: 'Android host not generated',
      );
    }
  }

  Future<void> initialize(TranslationSettings settings) async {
    await _control.invokeMethod<void>('initialize', settings.toNativeMap());
  }

  Future<void> start(TranslationSettings settings) async {
    await _control.invokeMethod<void>('start', settings.toNativeMap());
  }

  Future<void> stop() => _control.invokeMethod<void>('stop');

  Future<void> reset() => _control.invokeMethod<void>('reset');

  Future<void> updateSettings(TranslationSettings settings) =>
      _control.invokeMethod<void>('updateSettings', settings.toNativeMap());

  Future<void> setMicMuted(bool muted) =>
      _control.invokeMethod<void>('setMicMuted', <String, Object?>{
        'muted': muted,
      });

  Future<void> setTtsMuted(bool muted) =>
      _control.invokeMethod<void>('setTtsMuted', <String, Object?>{
        'muted': muted,
      });
}
