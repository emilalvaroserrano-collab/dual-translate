import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_translator_edge/language_router.dart';

void main() {
  const router = LanguageRouter();

  test('English pairs with Dutch/Flemish', () {
    final first = router.route(
      detectedLanguage: 'English (US)',
      currentGuestLanguage: 'English (US)',
    );
    expect(first.targetLanguage, 'Dutch (Flemish)');

    final second = router.route(
      detectedLanguage: 'Dutch (Flemish)',
      currentGuestLanguage: first.guestLanguage,
    );
    expect(second.targetLanguage, 'English (US)');
  });

  test('new non-Dutch language becomes latest guest', () {
    final french = router.route(
      detectedLanguage: 'French',
      currentGuestLanguage: 'English (US)',
    );
    expect(french.guestChanged, isTrue);
    expect(french.guestLanguage, 'French');
    expect(french.targetLanguage, 'Dutch (Flemish)');

    final dutch = router.route(
      detectedLanguage: 'Dutch',
      currentGuestLanguage: french.guestLanguage,
    );
    expect(dutch.targetLanguage, 'French');
  });

  test('Tagalog replaces French without changing Dutch target', () {
    final route = router.route(
      detectedLanguage: 'Tagalog (Filipino)',
      currentGuestLanguage: 'French',
    );
    expect(route.guestLanguage, 'Tagalog (Filipino)');
    expect(route.targetLanguage, 'Dutch (Flemish)');
  });
}
