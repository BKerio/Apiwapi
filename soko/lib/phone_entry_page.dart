import 'package:flutter/material.dart';

import 'home_page.dart';
import 'push_notifications.dart';

/// Shown once, on first launch: lets the member type the phone number an
/// admin already onboarded them with (Members page / CSV import), so this
/// install's push token gets paired with their Member record. See
/// backend/src/modules/members/device-token.routes.ts. Never creates a new
/// Member - a phone the backend doesn't recognize is rejected.
class PhoneEntryPage extends StatefulWidget {
  const PhoneEntryPage({super.key});

  @override
  State<PhoneEntryPage> createState() => _PhoneEntryPageState();
}

class _PhoneEntryPageState extends State<PhoneEntryPage> {
  final _controller = TextEditingController();
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    final phone = _controller.text.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'Enter your phone number');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await PushNotificationService.instance.registerPhone(phone);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MyHomePage(title: 'Flutter Demo Home Page')),
      );
    } catch (err) {
      setState(() => _error = err.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Welcome', style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 8),
                const Text('Enter the phone number you were registered with to enable notifications.'),
                const SizedBox(height: 24),
                TextField(
                  controller: _controller,
                  keyboardType: TextInputType.phone,
                  enabled: !_submitting,
                  decoration: InputDecoration(
                    labelText: 'Phone number',
                    hintText: '07XXXXXXXX',
                    border: const OutlineInputBorder(),
                    errorText: _error,
                  ),
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Continue'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
