import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_translator_edge/local_translation_engine.dart';

void main() {
  test('parses native readiness without hiding issues', () {
    final caps = NativeCapabilities.fromMap(<Object?, Object?>{
      'localRuntimeLinked': false,
      'nativeLibraryLoaded': true,
      'pipelineReady': false,
      'modelsPresent': true,
      'modelsVerified': false,
      'runtimeAbi': 2,
      'revision': 'contract-v2',
      'modelProfile': 'android-default',
      'vad': 'Silero VAD not linked',
      'stt': 'whisper.cpp not linked',
      'llm': 'llama.cpp not linked',
      'tts': 'sherpa-onnx not linked',
      'issues': <String>['Native pipeline is not compiled as ready.'],
    });

    expect(caps.localRuntimeLinked, isFalse);
    expect(caps.nativeLibraryLoaded, isTrue);
    expect(caps.pipelineReady, isFalse);
    expect(caps.modelsPresent, isTrue);
    expect(caps.runtimeAbi, 2);
    expect(caps.issues, contains('Native pipeline is not compiled as ready.'));
  });
}
