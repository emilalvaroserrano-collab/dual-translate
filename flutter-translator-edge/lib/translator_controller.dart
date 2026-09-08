import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import 'local_translation_engine.dart';
import 'models.dart';

class TranslatorController extends ChangeNotifier {
  TranslatorController(this._engine) {
    _subscription = _engine.events.listen(
      _handleEvent,
      onError: (Object error, StackTrace stackTrace) {
        _setError('Native event stream failed: $error');
      },
    );
  }

  final LocalTranslationEngine _engine;
  late final StreamSubscription<EngineEvent> _subscription;

  TranslationSettings settings = const TranslationSettings();
  final List<ConversationTurn> turns = <ConversationTurn>[];
  final List<HistoryItem> history = <HistoryItem>[];
  final Set<String> _savedHistoryIds = <String>{};

  bool connected = false;
  bool connecting = false;
  bool micMuted = false;
  bool ttsMuted = false;
  bool isAiSpeaking = false;
  double micLevel = 0;
  String status = 'Ready';
  String? errorMessage;

  Future<void> connect() async {
    if (connected || connecting) return;
    connecting = true;
    errorMessage = null;
    status = 'Checking local models...';
    notifyListeners();

    try {
      final caps = await _engine.capabilities();
      if (!caps.localRuntimeLinked) {
        _setError(
          'Local runtime is not linked yet. Run the Android bootstrap, then '
          'wire Silero VAD + whisper.cpp + llama.cpp + sherpa-onnx. '
          'No cloud fallback is used.',
        );
        return;
      }

      await _engine.initialize(settings);
      await _engine.start(settings);
      connected = true;
      connecting = false;
      status = 'Streaming locally';
      notifyListeners();
    } on PlatformException catch (error) {
      _setError(error.message ?? error.code);
    } on MissingPluginException {
      _setError(
        'Android native bridge is missing. Run tool/bootstrap_android.sh.',
      );
    } catch (error) {
      _setError('Failed to start local translation: $error');
    }
  }

  Future<void> disconnect() async {
    try {
      await _engine.stop();
    } catch (_) {
      // The UI must still settle even if native teardown fails.
    }
    connected = false;
    connecting = false;
    micMuted = false;
    isAiSpeaking = false;
    micLevel = 0;
    status = 'Ready';
    notifyListeners();
  }

  Future<void> toggleConnection() async {
    if (connected) {
      await disconnect();
    } else {
      await connect();
    }
  }

  Future<void> toggleMic() async {
    if (!connected) {
      await connect();
      return;
    }
    micMuted = !micMuted;
    await _engine.setMicMuted(micMuted);
    notifyListeners();
  }

  Future<void> toggleTts() async {
    ttsMuted = !ttsMuted;
    try {
      await _engine.setTtsMuted(ttsMuted);
    } catch (_) {
      // Keep the UI state deterministic even before the native runtime is linked.
    }
    notifyListeners();
  }

  Future<void> resetConversation() async {
    turns.clear();
    try {
      await _engine.reset();
    } catch (_) {}
    notifyListeners();
  }

  void clearHistory() {
    history.clear();
    _savedHistoryIds.clear();
    notifyListeners();
  }

  Future<void> updateSettings(TranslationSettings next) async {
    if (connected) return;
    settings = next;
    try {
      await _engine.updateSettings(settings);
    } catch (_) {
      // Native runtime may not be generated yet; settings remain valid UI state.
    }
    notifyListeners();
  }

  String exportHistoryText() {
    final buffer = StringBuffer(
      'Time\tSource Language\tTarget Language\tSource\tTranslation\n',
    );
    for (final item in history) {
      buffer.writeln(
        '${item.timestamp.toIso8601String()}\t${item.sourceLanguage}\t'
        '${item.targetLanguage}\t${item.sourceText.replaceAll('\t', ' ')}\t'
        '${item.translatedText.replaceAll('\t', ' ')}',
      );
    }
    return buffer.toString();
  }

  void _handleEvent(EngineEvent event) {
    switch (event.type) {
      case EngineEventType.inputPartial:
      case EngineEventType.inputFinal:
        _upsertTurn(
          event: event,
          role: TurnRole.input,
          isFinal: event.type == EngineEventType.inputFinal,
        );
        break;
      case EngineEventType.translationPartial:
      case EngineEventType.translationFinal:
        _upsertTurn(
          event: event,
          role: TurnRole.translation,
          isFinal: event.type == EngineEventType.translationFinal,
        );
        if (event.type == EngineEventType.translationFinal) {
          _saveHistoryOnce(event.utteranceId);
        }
        break;
      case EngineEventType.guestLanguageChanged:
        final language = event.targetLanguage ?? event.sourceLanguage;
        if (language != null && language.isNotEmpty) {
          settings = settings.copyWith(
            guestLanguage: language,
            autoDetectGuest: false,
            continuousGuestMonitoring: true,
          );
        }
        break;
      case EngineEventType.micLevel:
        micLevel = (event.level ?? 0).clamp(0.0, 1.0).toDouble();
        break;
      case EngineEventType.audioStarted:
        isAiSpeaking = true;
        break;
      case EngineEventType.audioEnded:
        isAiSpeaking = false;
        break;
      case EngineEventType.interrupted:
        isAiSpeaking = false;
        break;
      case EngineEventType.turnComplete:
        _saveHistoryOnce(event.utteranceId);
        break;
      case EngineEventType.error:
        errorMessage = event.message ?? 'Unknown native error';
        status = 'Error';
        break;
      case EngineEventType.state:
        status = event.state ?? status;
        break;
    }
    notifyListeners();
  }

  void _upsertTurn({
    required EngineEvent event,
    required TurnRole role,
    required bool isFinal,
  }) {
    final utteranceId = event.utteranceId;
    if (utteranceId == null || utteranceId.isEmpty) return;
    final id = '$utteranceId:${role.name}';
    final index = turns.indexWhere((turn) => turn.id == id);
    final text = event.text ?? '';

    if (index >= 0) {
      turns[index] = turns[index].copyWith(
        text: text,
        isFinal: isFinal,
        sourceLanguage: event.sourceLanguage,
        targetLanguage: event.targetLanguage,
      );
      return;
    }

    turns.add(
      ConversationTurn(
        id: id,
        utteranceId: utteranceId,
        role: role,
        text: text,
        isFinal: isFinal,
        createdAt: DateTime.now(),
        sourceLanguage: event.sourceLanguage,
        targetLanguage: event.targetLanguage,
      ),
    );
  }

  void _saveHistoryOnce(String? utteranceId) {
    if (utteranceId == null || _savedHistoryIds.contains(utteranceId)) return;
    ConversationTurn? input;
    ConversationTurn? translation;
    for (final turn in turns) {
      if (turn.utteranceId != utteranceId) continue;
      if (turn.role == TurnRole.input && turn.isFinal) input = turn;
      if (turn.role == TurnRole.translation && turn.isFinal) {
        translation = turn;
      }
    }
    if (input == null || translation == null) return;

    _savedHistoryIds.add(utteranceId);
    history.insert(
      0,
      HistoryItem(
        utteranceId: utteranceId,
        sourceText: input.text,
        translatedText: translation.text,
        sourceLanguage: input.sourceLanguage ?? settings.staffLanguage,
        targetLanguage: translation.targetLanguage ?? settings.guestLanguage,
        timestamp: DateTime.now(),
      ),
    );
  }

  void _setError(String message) {
    connected = false;
    connecting = false;
    isAiSpeaking = false;
    micLevel = 0;
    errorMessage = message;
    status = 'Local runtime unavailable';
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}
