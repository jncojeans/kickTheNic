import { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ImageBackground } from 'react-native';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { CircularProgress } from '@/components/CircularProgress';
import { GlassContainer } from '@/components/GlassContainer';
import { Timer, Pause, Play, CircleStop as StopCircle } from 'lucide-react-native';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '@/lib/supabase';
import { PostgrestError } from '@supabase/supabase-js';

const BACKGROUND_FETCH_TASK = 'background-fetch';

// Define the background task
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return BackgroundFetch.BackgroundFetchResult.NoData;

  const { data: activePouches } = await supabase
    .from('pouches')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .is('end_time', null);

  if (!activePouches?.length) return BackgroundFetch.BackgroundFetchResult.NoData;

  for (const pouch of activePouches) {
    const elapsedTime = (Date.now() - new Date(pouch.start_time).getTime()) / 1000;
    const pauseDuration = pouch.total_pause_duration ? 
      parseInt(pouch.total_pause_duration.replace(' seconds', '')) : 0;
    
    const actualDuration = (elapsedTime - pauseDuration) / 60;
    
    if (actualDuration >= pouch.target_duration) {
      await supabase
        .from('pouches')
        .update({
          end_time: new Date().toISOString(),
          is_active: false,
          paused_at: null
        })
        .eq('id', pouch.id);

      if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Pouch Timer Complete',
            body: 'Your pouch timer has finished!',
            sound: true,
          },
          trigger: null,
        });
      }
    }
  }

  return BackgroundFetch.BackgroundFetchResult.NewData;
});

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function Dashboard() {
  const [duration, setDuration] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPouchId, setCurrentPouchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [backgroundTaskRegistered, setBackgroundTaskRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-SemiBold': Inter_600SemiBold,
  });

  // Register background fetch task
  useEffect(() => {
    const registerBackgroundFetch = async () => {
      try {
        if (Platform.OS === 'web') return;
        
        if (!backgroundTaskRegistered) {
          await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
            minimumInterval: 60, // 1 minute
            stopOnTerminate: false,
            startOnBoot: true,
          });
          setBackgroundTaskRegistered(true);
        }
      } catch (err) {
        console.warn(
          "Background fetch task registration failed:", 
          err instanceof Error ? err.message : 'Unknown error'
        );
      }
    };

    registerBackgroundFetch();
  }, [backgroundTaskRegistered]);

  // Cleanup background task on unmount
  useEffect(() => {
    return () => {
      if (Platform.OS !== 'web' && backgroundTaskRegistered) {
        BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK).catch(() => {
          // Ignore cleanup errors
        });
      }
    };
  }, [backgroundTaskRegistered]);

  const fetchHabits = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data: habits, error: habitsError } = await supabase
        .from('current_habits')
        .select('duration_per_pouch')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (habitsError) throw habitsError;
      if (!habits) throw new Error('No habits found');

      const durationInSeconds = habits.duration_per_pouch * 60;
      setDuration(durationInSeconds);
      setRemainingTime(durationInSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHabits();
  }, [fetchHabits]);

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS !== 'web') {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          setError('Permission to send notifications was denied');
        }
      }
    };

    requestPermissions();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && Platform.OS !== 'web') {
      SplashScreen.hideAsync().catch(() => {
        // Ignore errors when hiding splash screen
      });
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && !isPaused && remainingTime > 0) {
      interval = setInterval(() => {
        setRemainingTime((time) => {
          if (time <= 1) {
            // Schedule notification when timer ends
            if (Platform.OS !== 'web') {
              Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Pouch Timer Complete',
                  body: 'Your pouch timer has finished!',
                  sound: true,
                },
                trigger: null, // Send immediately
              });
            }
            handleStop();
          }
          return time - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  const handleError = (error: PostgrestError | Error) => {
    setError(error instanceof Error ? error.message : 'An error occurred');
    setLoading(false);
  };

  if (!fontsLoaded && !fontError) {
    return <View style={styles.background} />;
  }

  const handleStart = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data: pouch, error: pouchError } = await supabase
        .from('pouches')
        .insert({
          user_id: user.id,
          target_duration: duration / 60, // Convert seconds to minutes
          is_active: true,
        })
        .select()
        .single();

      if (pouchError) throw pouchError;
      if (!pouch) throw new Error('Failed to create pouch');

      setCurrentPouchId(pouch.id);
    } catch (err) {
      handleError(err as Error | PostgrestError);
      return;
    }

    setIsActive(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    if (currentPouchId) {
      supabase
        .from('pouches')
        .update({
          paused_at: new Date().toISOString(),
        })
        .eq('id', currentPouchId)
        .then(({ error }) => {
          if (error) {
            handleError(error);
            return;
          }
          setIsPaused(true);
        });
    }
  };

  const handleResume = () => {
    if (currentPouchId) {
      supabase
        .from('pouches')
        .select('paused_at')
        .eq('id', currentPouchId)
        .single()
        .then(({ data: pouch, error }) => {
          if (error) {
            handleError(error);
            return;
          }
          
          if (pouch?.paused_at) {
            const pauseDuration = (Date.now() - new Date(pouch.paused_at).getTime()) / 1000;
            
            supabase
              .from('pouches')
              .update({
                paused_at: null,
                total_pause_duration: `${Math.floor(pauseDuration)} seconds`
              })
              .eq('id', currentPouchId)
              .then(({ error: updateError }) => {
                if (updateError) {
                  handleError(updateError);
                  return;
                }
                setIsPaused(false);
              });
          }
        });
    }
  };

  const handleStop = async () => {
    if (currentPouchId) {
      try {
        const { error: pouchError } = await supabase
          .from('pouches')
          .update({
            end_time: new Date().toISOString(),
            is_active: false,
            paused_at: null
          })
          .eq('id', currentPouchId);

        if (pouchError) throw pouchError;
      } catch (err) {
        handleError(err as Error | PostgrestError);
        return;
      }
    }

    setIsActive(false);
    setIsPaused(false);
    setRemainingTime(duration);
    setCurrentPouchId(null);
  };

  const progress = remainingTime / duration;

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=3270&auto=format&fit=crop' }}
      style={styles.background}
    >
      <View style={styles.overlay} />
      <View style={styles.container}>
        <GlassContainer style={styles.contentContainer}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : loading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : (
            <>
              <Text style={styles.title}>Current Pouch</Text>
              <View style={styles.timerContainer}>
                <CircularProgress
                  size={300}
                  strokeWidth={20}
                  progress={progress}
                  duration={duration}
                  remainingTime={remainingTime}
                />
              </View>
              <View style={styles.buttonContainer}>
                {!isActive ? (
                  <TouchableOpacity
                    style={styles.mainButton}
                    onPress={handleStart}
                  >
                    <Timer size={24} color="#fff" />
                    <Text style={styles.mainButtonText}>New Pouch</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.activeButtonsContainer}>
                    {isPaused ? (
                      <TouchableOpacity
                        style={[styles.controlButton, styles.resumeButton]}
                        onPress={handleResume}
                      >
                        <Play size={24} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.controlButton, styles.pauseButton]}
                        onPress={handlePause}
                      >
                        <Pause size={24} color="#fff" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.controlButton, styles.stopButton]}
                      onPress={handleStop}
                    >
                      <StopCircle size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </>
          )}
        </GlassContainer>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  contentContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    color: '#fff',
    textAlign: 'center',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 32,
  },
  timerContainer: {
    marginBottom: 32,
  },
  buttonContainer: {
    width: '100%',
  },
  mainButton: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  activeButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#4F46E5',
  },
  resumeButton: {
    backgroundColor: '#059669',
  },
  stopButton: {
    backgroundColor: '#DC2626',
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'Inter-Regular',
  },
  loadingText: {
    color: '#fff',
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
});