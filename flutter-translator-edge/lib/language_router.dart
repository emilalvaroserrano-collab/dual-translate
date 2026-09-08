class RouteDecision {
  const RouteDecision({
    required this.sourceLanguage,
    required this.targetLanguage,
    required this.guestLanguage,
    required this.guestChanged,
  });

  final String sourceLanguage;
  final String targetLanguage;
  final String guestLanguage;
  final bool guestChanged;
}

class LanguageRouter {
  const LanguageRouter();

  static const Set<String> _dutchGroup = <String>{
    'dutch',
    'dutch (flemish)',
    'flemish',
    'nl',
    'nl-be',
    'nl-nl',
  };

  bool isDutchGroup(String language) =>
      _dutchGroup.contains(language.trim().toLowerCase());

  RouteDecision route({
    required String detectedLanguage,
    required String currentGuestLanguage,
    String staffLanguage = 'Dutch (Flemish)',
  }) {
    final detected = detectedLanguage.trim();
    final guest = currentGuestLanguage.trim();

    if (detected.isEmpty) {
      throw ArgumentError.value(
        detectedLanguage,
        'detectedLanguage',
        'Language must not be empty.',
      );
    }

    if (isDutchGroup(detected)) {
      return RouteDecision(
        sourceLanguage: detected,
        targetLanguage: guest.isEmpty ? staffLanguage : guest,
        guestLanguage: guest,
        guestChanged: false,
      );
    }

    return RouteDecision(
      sourceLanguage: detected,
      targetLanguage: staffLanguage,
      guestLanguage: detected,
      guestChanged: guest.toLowerCase() != detected.toLowerCase(),
    );
  }
}
