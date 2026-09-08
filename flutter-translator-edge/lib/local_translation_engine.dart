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
    this.nativeLibraryLoaded = false,
    this.pipelineReady = false,
    this.modelsPresent = false,
    this.modelsVerified = false,
    this.runtimeAbi = 0,
    this.revision = 'unknown',
    this.modelProfile = 'none',
    this.issues = const <String>[],
  });

  final bool localRuntimeLinked;
  final bool nativeLibraryLoaded;
  final bool pipelineReady;
  final bool modelsPresent;
  final bool modelsVerified;
  final int runtimeAbi;
  final String revision;
  final String modelProfile;
  final String stt;
  final String llm;
  final String tts;
  final String vad;
  final List<String> issues;

  factory NativeCapabilities.fromMap(Map<Object?, Object?> map) {
    final rawIssues = map['issues'];
    return NativeCapabilities(
      localRuntimeLinked: map['localRuntimeLinked'] == true,
      nativeLibraryLoaded: map['nativeLibraryLoaded'] == true,
      pipelineReady: map['pipelineReady'] == true,
      modelsPresent: map['modelsPresent'] == true,
      modelsVerified: map['modelsVerified'] == true,
      runtimeAbi: map['runtimeAbi'] is num ? (map['runtimeAbi'] as num).toInt() : 0,
      revision: map['revision']?.toString() ?? 'unknown',
      modelProfile: map['modelProfile']?.toString() ?? 'none',
      stt: map['stt']?.toString() ?? 'not linked',
      llm: map['llm']?.toString() ?? 'not linked',
      tts: map['tts']?.toString() ?? 'not linked',
      vad: map['vad']?.toString() ?? 'not linked',
      issues: rawIssues is List
          ? rawIssues.map((Object? item) => item.toString()).toList(growable: false)
          : const <String>[],
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
        issues: <String>['Android native bridge is missing.'],
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
