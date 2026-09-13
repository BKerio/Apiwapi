import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'device_registration.dart';
import 'firebase_options.dart';

/// Web only: Firebase Console → Project settings → Cloud Messaging →
/// Web configuration → Web Push certificates → generate a key pair, then
/// paste the "Key pair" value here. Required for `getToken()` to work on web;
/// ignored on Android/iOS.
const String _webVapidKey = 'REPLACE_WITH_YOUR_VAPID_KEY';

/// Must be a top-level (or static) function: the platform relaunches an
/// isolate to run this when a data/notification message arrives while the
/// app is backgrounded or terminated.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  debugPrint('Handling a background message: ${message.messageId}');
}

/// Wraps Firebase Cloud Messaging + local notification display so the rest
/// of the app only has to call [PushNotificationService.instance.initialize].
class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const _androidChannel = AndroidNotificationChannel(
    'high_importance_channel',
    'High Importance Notifications',
    description: 'Used for important notifications shown in the foreground.',
    importance: Importance.high,
  );

  /// Called when the user taps a notification (foreground-displayed local
  /// notification, or the system tray notification while backgrounded).
  void Function(RemoteMessage message)? onMessageTapped;

  Future<void> initialize() async {
    await _setupLocalNotifications();

    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    debugPrint('Notification permission status: ${settings.authorizationStatus}');

    // Foreground messages don't show a system notification by default, so
    // render one ourselves via flutter_local_notifications.
    FirebaseMessaging.onMessage.listen(_showForegroundNotification);

    // Tapped a notification while the app was backgrounded.
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      onMessageTapped?.call(message);
    });

    // App was launched by tapping a notification while terminated.
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      onMessageTapped?.call(initialMessage);
    }

    final token = await _messaging.getToken(
      vapidKey: kIsWeb ? _webVapidKey : null,
    );
    debugPrint('FCM registration token: $token');
    // If this device already checked in with a phone number on a previous
    // launch, silently keep the backend's copy of the token current -
    // otherwise there's nothing to associate it with yet (see
    // PhoneEntryPage/registerPhone, called once the user checks in).
    if (token != null) unawaited(_resyncIfKnown(token));

    // Re-sync whenever the token rotates.
    _messaging.onTokenRefresh.listen((newToken) {
      debugPrint('FCM token refreshed: $newToken');
      unawaited(_resyncIfKnown(newToken));
    });
  }

  Future<void> _resyncIfKnown(String token) async {
    final phone = await DeviceRegistration.getStoredPhone();
    if (phone == null) return;
    try {
      await DeviceRegistration.register(phone: phone, token: token, platform: _platformName());
    } catch (err) {
      debugPrint('Device token re-sync failed: $err');
    }
  }

  String _platformName() {
    if (kIsWeb) return 'WEB';
    return defaultTargetPlatform == TargetPlatform.iOS ? 'IOS' : 'ANDROID';
  }

  /// Pairs this device with the Member record for `phone` - called once,
  /// from the phone check-in screen shown on first launch. Throws
  /// [DeviceRegistrationException] (safe to show to the user) if the phone
  /// isn't recognized or the request fails.
  Future<void> registerPhone(String phone) async {
    final token = await _messaging.getToken(vapidKey: kIsWeb ? _webVapidKey : null);
    if (token == null) {
      throw DeviceRegistrationException('Could not get a push token yet - check your connection and try again.');
    }
    await DeviceRegistration.register(phone: phone, token: token, platform: _platformName());
  }

  Future<void> _setupLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    const initSettings = InitializationSettings(
      android: androidInit,
      iOS: iosInit,
    );

    await _localNotifications.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: (details) {
        // Tapped the local notification we rendered while foregrounded.
      },
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);
  }

  void _showForegroundNotification(RemoteMessage message) {
    final notification = message.notification;
    final android = message.notification?.android;
    if (notification == null) return;

    _localNotifications.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          icon: android?.smallIcon ?? '@mipmap/ic_launcher',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }

  /// Optional: group users by topic instead of tracking individual tokens.
  Future<void> subscribeToTopic(String topic) => _messaging.subscribeToTopic(topic);

  Future<void> unsubscribeFromTopic(String topic) =>
      _messaging.unsubscribeFromTopic(topic);
}
