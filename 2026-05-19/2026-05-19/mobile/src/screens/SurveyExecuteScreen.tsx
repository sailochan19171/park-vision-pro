import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import { Q } from '@nozbe/watermelondb';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import database from '../db/database';

type RouteParams = {
  SurveyExecute: {
    surveyId: string;
    title: string;
    customerCode: string;
    customerName: string;
    visitCode?: string;
  };
};

type QuestionType = 'text' | 'yes_no' | 'single_choice' | 'multi_choice' | 'rating';

interface Question {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
}

export default function SurveyExecuteScreen() {
  const route = useRoute<RouteProp<RouteParams, 'SurveyExecute'>>();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { surveyId, title, customerCode, customerName, visitCode } = route.params;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSurvey = useCallback(async () => {
    try {
      const records = await database
        .get('surveys')
        .query(Q.where('id', surveyId))
        .fetch();

      if (records.length > 0) {
        const r: any = records[0];
        const parsed: Question[] = JSON.parse(r.questionsJson ?? '[]');
        setQuestions(parsed);
      }
    } catch (err) {
      console.error('SurveyExecuteScreen loadSurvey error:', err);
      Alert.alert('Error', 'Could not load survey questions.');
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => {
    loadSurvey();
  }, [loadSurvey]);

  const setAnswer = (questionId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultiChoice = (questionId: string, option: string) => {
    setAnswers((prev) => {
      const current: string[] = prev[questionId] ?? [];
      const updated = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [questionId]: updated };
    });
  };

  const handleNext = () => {
    const question = questions[currentStep];
    if (question?.required && answers[question.id] === undefined) {
      Alert.alert('Required', 'Please answer this question before continuing.');
      return;
    }
    if (currentStep < questions.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSubmit = async () => {
    const question = questions[currentStep];
    if (question?.required && answers[question.id] === undefined) {
      Alert.alert('Required', 'Please answer this question before submitting.');
      return;
    }

    setSaving(true);
    try {
      await database.write(async () => {
        await database.get('survey_responses').create((rec: any) => {
          rec._raw.id = uuidv4();
          rec.appTrxId = uuidv4();
          rec.surveyId = surveyId;
          rec.userCode = user?.code ?? '';
          rec.customerCode = customerCode;
          rec.visitCode = visitCode ?? null;
          rec.answersJson = JSON.stringify(answers);
          rec.completedOn = Date.now();
          rec.isSynced = false;
        });
      });

      Alert.alert('Survey Submitted', 'Thank you for completing the survey.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Failed to submit survey. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>No questions found for this survey.</Text>
      </View>
    );
  }

  const question = questions[currentStep];
  const isLast = currentStep === questions.length - 1;
  const progressPct = ((currentStep + 1) / questions.length) * 100;

  const renderAnswerInput = () => {
    const currentAnswer = answers[question.id];

    switch (question.type) {
      case 'text':
        return (
          <TextInput
            style={styles.textAnswer}
            placeholder="Type your answer here..."
            placeholderTextColor={Colors.textSecondary}
            value={currentAnswer ?? ''}
            onChangeText={(v) => setAnswer(question.id, v)}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        );

      case 'yes_no':
        return (
          <View style={styles.yesNoRow}>
            {['Yes', 'No'].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.yesNoBtn,
                  currentAnswer === opt && (opt === 'Yes' ? styles.yesNoBtnYes : styles.yesNoBtnNo),
                ]}
                activeOpacity={0.75}
                onPress={() => setAnswer(question.id, opt)}
              >
                <Text
                  style={[
                    styles.yesNoBtnText,
                    currentAnswer === opt &&
                      (opt === 'Yes' ? styles.yesNoBtnTextYes : styles.yesNoBtnTextNo),
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'single_choice':
        return (
          <View style={styles.choiceList}>
            {(question.options ?? []).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.radioRow,
                  currentAnswer === opt && styles.radioRowSelected,
                ]}
                activeOpacity={0.7}
                onPress={() => setAnswer(question.id, opt)}
              >
                <View style={[styles.radioCircle, currentAnswer === opt && styles.radioCircleSelected]}>
                  {currentAnswer === opt && <View style={styles.radioDot} />}
                </View>
                <Text
                  style={[
                    styles.optionText,
                    currentAnswer === opt && styles.optionTextSelected,
                  ]}
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'multi_choice': {
        const selected: string[] = currentAnswer ?? [];
        return (
          <View style={styles.choiceList}>
            {(question.options ?? []).map((opt) => {
              const checked = selected.includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.checkboxRow, checked && styles.checkboxRowSelected]}
                  activeOpacity={0.7}
                  onPress={() => toggleMultiChoice(question.id, opt)}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      checked && styles.optionTextSelected,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      }

      case 'rating':
        return (
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                style={[
                  styles.starBtn,
                  currentAnswer !== undefined && star <= currentAnswer && styles.starBtnActive,
                ]}
                activeOpacity={0.7}
                onPress={() => setAnswer(question.id, star)}
              >
                <Text
                  style={[
                    styles.starText,
                    currentAnswer !== undefined && star <= currentAnswer && styles.starTextActive,
                  ]}
                >
                  ★
                </Text>
              </TouchableOpacity>
            ))}
            {currentAnswer !== undefined && (
              <Text style={styles.ratingLabel}>{currentAnswer} / 5</Text>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressHeader}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>
          {currentStep + 1} / {questions.length}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Question Card */}
        <View style={styles.questionCard}>
          <Text style={styles.questionNumber}>Question {currentStep + 1}</Text>
          <Text style={styles.questionText}>{question.text}</Text>
        </View>

        {/* Answer Input */}
        <View style={styles.answerSection}>{renderAnswerInput()}</View>
      </ScrollView>

      {/* Navigation Footer */}
      <View style={styles.navFooter}>
        <TouchableOpacity
          style={[styles.navBtn, currentStep === 0 && styles.navBtnDisabled]}
          activeOpacity={0.7}
          onPress={handleBack}
          disabled={currentStep === 0}
        >
          <Text style={[styles.navBtnText, currentStep === 0 && styles.navBtnTextDisabled]}>
            Back
          </Text>
        </TouchableOpacity>

        {isLast ? (
          <TouchableOpacity
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            activeOpacity={0.8}
            onPress={handleSubmit}
            disabled={saving}
          >
            <Text style={styles.submitBtnText}>
              {saving ? 'Submitting...' : 'Submit Survey'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.nextBtn}
            activeOpacity={0.8}
            onPress={handleNext}
          >
            <Text style={styles.nextBtnText}>Next</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  android: { elevation: 2 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  progressHeader: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.background,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'right',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 20,
  },
  questionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    ...cardShadow,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 26,
  },
  answerSection: {
    gap: 8,
  },
  textAnswer: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 120,
    textAlignVertical: 'top',
    ...cardShadow,
  },
  yesNoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  yesNoBtn: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 14,
    backgroundColor: Colors.card,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    ...cardShadow,
  },
  yesNoBtnYes: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  yesNoBtnNo: {
    backgroundColor: '#fef2f2',
    borderColor: Colors.danger,
  },
  yesNoBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  yesNoBtnTextYes: {
    color: Colors.primaryDark,
  },
  yesNoBtnTextNo: {
    color: Colors.danger,
  },
  choiceList: {
    gap: 8,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    ...cardShadow,
  },
  radioRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    ...cardShadow,
  },
  checkboxRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkMark: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  optionText: {
    fontSize: 15,
    color: Colors.text,
    flex: 1,
  },
  optionTextSelected: {
    color: Colors.primaryDark,
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  starBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...cardShadow,
  },
  starBtnActive: {
    backgroundColor: Colors.warning,
    borderColor: Colors.warning,
  },
  starText: {
    fontSize: 26,
    color: Colors.border,
  },
  starTextActive: {
    color: Colors.white,
  },
  ratingLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    marginLeft: 4,
  },
  navFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  navBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  navBtnTextDisabled: {
    color: Colors.textSecondary,
  },
  nextBtn: {
    flex: 2,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  nextBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 2,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: Colors.primaryDark,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
