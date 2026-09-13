import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

/// Base URL of the backend API this app pairs itself with.
///
/// - Android emulator: 10.0.2.2 is the special alias the emulator maps to
///   the host machine's own localhost - use this if the backend is running
///   on the same machine as the emulator (the default here).
/// - Physical device: replace with your machine's LAN IP (e.g.
///   http://192.168.1.20:3000) - the phone can't reach "localhost" meaning
///   itself.
/// - iOS simulator: localhost works as-is (no alias needed).
const String apiBaseUrl = 'http://192.168.1.148:3000';

const _phoneKey = 'registered_phone';

/// Thrown when the backend rejects a registration attempt (e.g. no member
/// with that phone number yet) - `message` is safe to show to the user.
class DeviceRegistrationException implements Exception {
  DeviceRegistrationException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Pairs this install's FCM token with the Member record staff already
/// created via the admin panel, by phone number - see
/// backend/src/modules/members/device-token.routes.ts. Not a signup
/// mechanism: the backend rejects any phone it doesn't already recognize.
class DeviceRegistration {
  DeviceRegistration._();

  /// The phone number this device last successfully registered with, or
  /// null if it hasn't checked in yet.
  static Future<String?> getStoredPhone() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_phoneKey);
  }

  static Future<void> _storePhone(String phone) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_phoneKey, phone);
  }

  /// Registers (or re-registers - e.g. after a token rotation, or the app
  /// moved to a different member's phone) this device's push token against
  /// the Member with this phone number. Persists `phone` locally on success
  /// so future launches/refreshes can silently re-sync without asking again.
  static Future<void> register({
    required String phone,
    required String token,
    required String platform,
  }) async {
    final uri = Uri.parse('$apiBaseUrl/public/device-tokens');
    final http.Response response;
    try {
      response = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'phone': phone, 'token': token, 'platform': platform}),
      );
    } catch (err) {
      throw DeviceRegistrationException('Could not reach the server - check your connection and try again.');
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      await _storePhone(phone);
      return;
    }

    var message = 'Registration failed (HTTP ${response.statusCode})';
    try {
      final body = jsonDecode(response.body) as Map<String, dynamic>;
      if (body['message'] is String) message = body['message'] as String;
    } catch (_) {
      // Fall back to the generic message above if the body isn't JSON.
    }
    throw DeviceRegistrationException(message);
  }
}
