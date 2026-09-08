import 'package:flutter/foundation.dart';

enum TurnRole { input, translation }

@immutable
class ConversationTurn {
  const ConversationTurn({
    required this.id,
    required this.utteranceId,
    required this.role,
    required this.text,
    required this.isFinal,
    required this.createdAt,
    this.sourceLanguage,
    this.targetLanguage,
  });

  final String id;
  final String utteranceId;
  final TurnRole role;
  final String text;
  final bool isFinal;
  final DateTime createdAt;
  final String? sourceLanguage;
  final String? targetLanguage;

  ConversationTurn copyWith({
    String? text,
    bool? isFinal,
    String? sourceLanguage,
    String? targetLanguage,
  }) {
    return ConversationTurn(
      id: id,
      utteranceId: utteranceId,
      role: role,
      text: text ?? this.text,
      isFinal: isFinal ?? this.isFinal,
      createdAt: createdAt,
      sourceLanguage: sourceLanguage ?? this.sourceLanguage,
      targetLanguage: targetLanguage ?? this.targetLanguage,
    );
  }
}

@immutable
class HistoryItem {
  const HistoryItem({
    required this.utteranceId,
    required this.sourceText,
    required this.translatedText,
    required this.sourceLanguage,
    required this.targetLanguage,
    required this.timestamp,
  });

  final String utteranceId;
  final String sourceText;
  final String translatedText;
  final String sourceLanguage;
  final String targetLanguage;
  final DateTime timestamp;
}

@immutable
class TranslationSettings {
  const TranslationSettings({
    this.staffLanguage = 'Dutch (Flemish)',
    this.guestLanguage = 'English (US)',
    this.autoDetectGuest = true,
    this.continuousGuestMonitoring = true,
    this.medicalMode = true,
    this.topic = 'Medical Consultation',
    this.voiceProfile = 'Auto (installed local pack)',
  });

  final String staffLanguage;
  final String guestLanguage;
  final bool autoDetectGuest;
  final bool continuousGuestMonitoring;
  final bool medicalMode;
  final String topic;
  final String voiceProfile;

  TranslationSettings copyWith({
    String? staffLanguage,
    String? guestLanguage,
    bool? autoDetectGuest,
    bool? continuousGuestMonitoring,
    bool? medicalMode,
    String? topic,
    String? voiceProfile,
  }) {
    return TranslationSettings(
      staffLanguage: staffLanguage ?? this.staffLanguage,
      guestLanguage: guestLanguage ?? this.guestLanguage,
      autoDetectGuest: autoDetectGuest ?? this.autoDetectGuest,
      continuousGuestMonitoring:
          continuousGuestMonitoring ?? this.continuousGuestMonitoring,
      medicalMode: medicalMode ?? this.medicalMode,
      topic: topic ?? this.topic,
      voiceProfile: voiceProfile ?? this.voiceProfile,
    );
  }

  Map<String, Object?> toNativeMap() => <String, Object?>{
        'staffLanguage': staffLanguage,
        'guestLanguage': guestLanguage,
        'autoDetectGuest': autoDetectGuest,
        'continuousGuestMonitoring': continuousGuestMonitoring,
        'medicalMode': medicalMode,
        'topic': topic,
        'voiceProfile': voiceProfile,
      };
}

enum EngineEventType {
  inputPartial,
  inputFinal,
  translationPartial,
  translationFinal,
  guestLanguageChanged,
  micLevel,
  audioStarted,
  audioEnded,
  interrupted,
  turnComplete,
  error,
  state,
}

@immutable
class EngineEvent {
  const EngineEvent({
    required this.type,
    this.sessionId,
    this.utteranceId,
    this.text,
    this.sourceLanguage,
    this.targetLanguage,
    this.level,
    this.message,
    this.state,
  });

  final EngineEventType type;
  final String? sessionId;
  final String? utteranceId;
  final String? text;
  final String? sourceLanguage;
  final String? targetLanguage;
  final double? level;
  final String? message;
  final String? state;

  factory EngineEvent.fromMap(Map<Object?, Object?> map) {
    final typeName = map['type']?.toString() ?? 'error';
    final type = switch (typeName) {
      'input_partial' => EngineEventType.inputPartial,
      'input_final' => EngineEventType.inputFinal,
      'translation_partial' => EngineEventType.translationPartial,
      'translation_final' => EngineEventType.translationFinal,
      'guest_language_changed' => EngineEventType.guestLanguageChanged,
      'mic_level' => EngineEventType.micLevel,
      'audio_started' => EngineEventType.audioStarted,
      'audio_ended' => EngineEventType.audioEnded,
      'interrupted' => EngineEventType.interrupted,
      'turn_complete' => EngineEventType.turnComplete,
      'state' => EngineEventType.state,
      _ => EngineEventType.error,
    };

    return EngineEvent(
      type: type,
      sessionId: map['sessionId']?.toString(),
      utteranceId: map['utteranceId']?.toString(),
      text: map['text']?.toString(),
      sourceLanguage: map['sourceLanguage']?.toString(),
      targetLanguage: map['targetLanguage']?.toString(),
      level: map['level'] is num ? (map['level'] as num).toDouble() : null,
      message: map['message']?.toString(),
      state: map['state']?.toString(),
    );
  }
}
