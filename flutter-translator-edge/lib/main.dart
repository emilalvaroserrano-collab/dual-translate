import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'language_catalog.dart';
import 'local_translation_engine.dart';
import 'models.dart';
import 'translator_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const DualTranslateEdgeApp());
}

class DualTranslateEdgeApp extends StatefulWidget {
  const DualTranslateEdgeApp({super.key});

  @override
  State<DualTranslateEdgeApp> createState() => _DualTranslateEdgeAppState();
}

class _DualTranslateEdgeAppState extends State<DualTranslateEdgeApp> {
  late final TranslatorController controller;

  @override
  void initState() {
    super.initState();
    controller = TranslatorController(LocalTranslationEngine());
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Dual Translator Edge',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF090B10),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF448DFF),
          brightness: Brightness.dark,
          surface: const Color(0xFF11151E),
        ),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      home: TranslatorPage(controller: controller),
    );
  }
}

class TranslatorPage extends StatelessWidget {
  const TranslatorPage({required this.controller, super.key});

  final TranslatorController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Scaffold(
          appBar: AppBar(
            title: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Dual Translator Edge'),
                Text(
                  'On-device runtime',
                  style: TextStyle(fontSize: 11, color: Colors.white54),
                ),
              ],
            ),
            actions: <Widget>[
              Builder(
                builder: (context) => IconButton(
                  tooltip: 'Settings',
                  icon: const Icon(Icons.tune),
                  onPressed: () => Scaffold.of(context).openEndDrawer(),
                ),
              ),
            ],
          ),
          endDrawer: SettingsDrawer(controller: controller),
          body: SafeArea(
            child: Column(
              children: <Widget>[
                if (controller.errorMessage != null)
                  _ErrorBanner(message: controller.errorMessage!),
                Expanded(
                  child: ConversationView(turns: controller.turns),
                ),
                ControlTray(controller: controller),
              ],
            ),
          ),
        );
      },
    );
  }
}

class ConversationView extends StatelessWidget {
  const ConversationView({required this.turns, super.key});

  final List<ConversationTurn> turns;

  @override
  Widget build(BuildContext context) {
    if (turns.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Icon(Icons.translate, size: 42, color: Colors.white24),
              SizedBox(height: 12),
              Text(
                'Ready for local translation',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 6),
              Text(
                'The UI never falls back to Gemini or another cloud model.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white54),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: turns.length,
      itemBuilder: (context, index) {
        final turn = turns[index];
        return _TurnCard(turn: turn);
      },
    );
  }
}

class _TurnCard extends StatelessWidget {
  const _TurnCard({required this.turn});

  final ConversationTurn turn;

  @override
  Widget build(BuildContext context) {
    final isInput = turn.role == TurnRole.input;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isInput ? const Color(0xFF121824) : const Color(0xFF101B18),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isInput ? const Color(0xFF25354D) : const Color(0xFF22443A),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text(
                isInput ? 'Input' : 'Translation',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: isInput ? const Color(0xFF73A9FF) : const Color(0xFF6EDAB8),
                ),
              ),
              const Spacer(),
              if (turn.sourceLanguage != null || turn.targetLanguage != null)
                Text(
                  '${turn.sourceLanguage ?? '?'} → ${turn.targetLanguage ?? '?'}',
                  style: const TextStyle(fontSize: 10, color: Colors.white38),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            turn.text.isEmpty ? '…' : turn.text,
            style: const TextStyle(fontSize: 17, height: 1.35),
          ),
          if (!turn.isFinal)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: LinearProgressIndicator(minHeight: 2),
            ),
        ],
      ),
    );
  }
}

class ControlTray extends StatelessWidget {
  const ControlTray({required this.controller, super.key});

  final TranslatorController controller;

  @override
  Widget build(BuildContext context) {
    final active = controller.connected && !controller.micMuted;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
      decoration: const BoxDecoration(
        color: Color(0xFF0D1118),
        border: Border(top: BorderSide(color: Color(0xFF1F2633))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          MicVisualizer(level: controller.micLevel, active: active),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              _RoundAction(
                tooltip: controller.micMuted ? 'Unmute microphone' : 'Microphone',
                icon: controller.micMuted ? Icons.mic_off : Icons.mic,
                active: active,
                onPressed: controller.toggleMic,
              ),
              _RoundAction(
                tooltip: controller.ttsMuted ? 'Unmute output' : 'Mute output',
                icon: controller.ttsMuted ? Icons.volume_off : Icons.volume_up,
                onPressed: controller.toggleTts,
              ),
              _RoundAction(
                tooltip: 'Reset conversation',
                icon: Icons.refresh,
                onPressed: controller.resetConversation,
              ),
              const SizedBox(width: 12),
              FilledButton.icon(
                onPressed: controller.connecting ? null : controller.toggleConnection,
                icon: Icon(
                  controller.connected
                      ? Icons.pause
                      : controller.connecting
                          ? Icons.sync
                          : Icons.play_arrow,
                ),
                label: Text(controller.connected ? 'Stop' : 'Start'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            controller.isAiSpeaking ? 'Speaking translation…' : controller.status,
            style: const TextStyle(fontSize: 12, color: Colors.white54),
          ),
        ],
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.active = false,
  });

  final String tooltip;
  final IconData icon;
  final Future<void> Function() onPressed;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: IconButton.filledTonal(
        tooltip: tooltip,
        onPressed: onPressed,
        icon: Icon(icon),
        style: IconButton.styleFrom(
          backgroundColor: active ? const Color(0xFF204B84) : null,
        ),
      ),
    );
  }
}

class MicVisualizer extends StatelessWidget {
  const MicVisualizer({required this.level, required this.active, super.key});

  final double level;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 28,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List<Widget>.generate(17, (index) {
          final distance = (index - 8).abs() / 8;
          final wave = math.max(0.14, (1 - distance) * level);
          final height = active ? 4 + wave * 22 : 3.0;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 80),
            width: 3,
            height: height,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: active ? const Color(0xFF448DFF) : Colors.white24,
              borderRadius: BorderRadius.circular(4),
            ),
          );
        }),
      ),
    );
  }
}

class SettingsDrawer extends StatefulWidget {
  const SettingsDrawer({required this.controller, super.key});

  final TranslatorController controller;

  @override
  State<SettingsDrawer> createState() => _SettingsDrawerState();
}

class _SettingsDrawerState extends State<SettingsDrawer> {
  late TranslationSettings draft;

  @override
  void initState() {
    super.initState();
    draft = widget.controller.settings;
  }

  @override
  Widget build(BuildContext context) {
    final locked = widget.controller.connected;
    return Drawer(
      width: math.min(MediaQuery.sizeOf(context).width * 0.92, 420),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            const Row(
              children: <Widget>[
                Icon(Icons.settings_suggest),
                SizedBox(width: 10),
                Text('Settings', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 20),
            const _ProfileCard(),
            const SizedBox(height: 20),
            AbsorbPointer(
              absorbing: locked,
              child: Opacity(
                opacity: locked ? 0.55 : 1,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    _LanguageField(
                      label: 'Staff Language (Language 1)',
                      value: draft.staffLanguage,
                      onChanged: (value) => setState(() {
                        draft = draft.copyWith(staffLanguage: value);
                      }),
                    ),
                    const SizedBox(height: 12),
                    _LanguageField(
                      label: 'Guest Language (Language 2)',
                      value: draft.guestLanguage,
                      onChanged: draft.autoDetectGuest
                          ? null
                          : (value) => setState(() {
                                draft = draft.copyWith(guestLanguage: value);
                              }),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Auto-detect Guest Language'),
                      subtitle: const Text(
                        'Continuous monitoring stays enabled internally after re-pairing.',
                        style: TextStyle(fontSize: 11),
                      ),
                      value: draft.autoDetectGuest,
                      onChanged: (value) => setState(() {
                        draft = draft.copyWith(autoDetectGuest: value);
                      }),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      initialValue: draft.voiceProfile,
                      decoration: const InputDecoration(labelText: 'Local Voice Profile'),
                      items: kVoiceProfiles
                          .map((voice) => DropdownMenuItem(value: voice, child: Text(voice)))
                          .toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() => draft = draft.copyWith(voiceProfile: value));
                        }
                      },
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      initialValue: draft.topic,
                      decoration: const InputDecoration(labelText: 'Topic'),
                      onChanged: (value) => draft = draft.copyWith(topic: value),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Medical terminology mode'),
                      subtitle: const Text('Must pass bilingual safety fixtures before production enablement.'),
                      value: draft.medicalMode,
                      onChanged: (value) => setState(() {
                        draft = draft.copyWith(medicalMode: value);
                      }),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: locked
                  ? null
                  : () async {
                      await widget.controller.updateSettings(draft);
                      if (context.mounted) Navigator.pop(context);
                    },
              child: const Text('Save Settings'),
            ),
            const Divider(height: 36),
            Row(
              children: <Widget>[
                const Expanded(
                  child: Text('Translation History', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
                IconButton(
                  tooltip: 'Export history',
                  onPressed: widget.controller.history.isEmpty
                      ? null
                      : () async {
                          await Clipboard.setData(
                            ClipboardData(text: widget.controller.exportHistoryText()),
                          );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('History copied as TSV. PDF exporter is still a parity task.'),
                              ),
                            );
                          }
                        },
                  icon: const Icon(Icons.download),
                ),
                IconButton(
                  tooltip: 'Clear history',
                  onPressed: widget.controller.history.isEmpty ? null : widget.controller.clearHistory,
                  icon: const Icon(Icons.delete_sweep),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (widget.controller.history.isEmpty)
              const Text('No history yet.', style: TextStyle(color: Colors.white54))
            else
              ...widget.controller.history.take(20).map(
                    (item) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: Text(item.translatedText, maxLines: 2, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        '${item.sourceLanguage} → ${item.targetLanguage}\n${item.sourceText}',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
            const Divider(height: 36),
            const Text(
              'Powered by Eburon AI • local inference only',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: Colors.white38),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF121722),
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Row(
        children: <Widget>[
          CircleAvatar(child: Icon(Icons.person)),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Local device session', style: TextStyle(fontWeight: FontWeight.w700)),
                Text(
                  'Firebase auth adapter remains a migration task',
                  style: TextStyle(fontSize: 11, color: Colors.white54),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LanguageField extends StatelessWidget {
  const _LanguageField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final String value;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: kLanguages
          .map((language) => DropdownMenuItem(value: language, child: Text(language)))
          .toList(),
      onChanged: onChanged == null
          ? null
          : (value) {
              if (value != null) onChanged!(value);
            },
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      color: const Color(0xFF4B1921),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.warning_amber, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(message, style: const TextStyle(fontSize: 12))),
        ],
      ),
    );
  }
}
