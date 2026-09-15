import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';

import 'device_registration.dart';
import 'firebase_options.dart';
import 'home_page.dart';
import 'phone_entry_page.dart';
import 'push_notifications.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // Must be registered before runApp() so background isolates pick it up.
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

  // Requests notification permission and gets the FCM token once, up front,
  // regardless of whether this device has checked in with a phone number yet
  // (StartupGate below decides that separately).
  await PushNotificationService.instance.initialize();

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        // This is the theme of your application.
        //
        // TRY THIS: Try running your application with "flutter run". You'll see
        // the application has a purple toolbar. Then, without quitting the app,
        // try changing the seedColor in the colorScheme below to Colors.green
        // and then invoke "hot reload" (save your changes or press the "hot
        // reload" button in a Flutter-supported IDE, or press "r" if you used
        // the command line to start the app).
        //
        // Notice that the counter didn't reset back to zero; the application
        // state is not lost during the reload. To reset the state, use hot
        // restart instead.
        //
        // This works for code too, not just values: Most code changes can be
        // tested with just a hot reload.
        colorScheme: .fromSeed(seedColor: Colors.deepPurple),
      ),
      home: const StartupGate(),
    );
  }
}

/// Decides what the user sees first: the phone check-in screen if this
/// install hasn't been paired with a Member yet, otherwise straight to the
/// home page. Push notifications themselves are already set up either way
/// (see main() above) - this only gates the one-time backend pairing step.
class StartupGate extends StatefulWidget {
  const StartupGate({super.key});

  @override
  State<StartupGate> createState() => _StartupGateState();
}

class _StartupGateState extends State<StartupGate> {
  late final Future<String?> _storedPhone;

  @override
  void initState() {
    super.initState();
    _storedPhone = DeviceRegistration.getStoredPhone();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: _storedPhone,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final alreadyRegistered = snapshot.data != null;
        return alreadyRegistered
            ? const MyHomePage(title: 'Push Notifications Demo')
            : const PhoneEntryPage();
      },
    );
  }
}
