import { Platform } from 'react-native';

// Font family mappings matching farmleysfa Android assets
export const Fonts = {
  // Inter — primary UI font
  inter: Platform.select({ android: 'inter', ios: 'Inter-Regular' }) ?? 'inter',
  interLight: Platform.select({ android: 'inter_light', ios: 'Inter-Light' }) ?? 'inter_light',
  interMedium: Platform.select({ android: 'inter_medium', ios: 'Inter-Medium' }) ?? 'inter_medium',
  interSemiBold: Platform.select({ android: 'inter_semibold', ios: 'Inter-SemiBold' }) ?? 'inter_semibold',
  interBold: Platform.select({ android: 'inter_bold_new', ios: 'Inter-Bold' }) ?? 'inter_bold_new',
  interExtraBold: Platform.select({ android: 'inter_extrabold', ios: 'Inter-ExtraBold' }) ?? 'inter_extrabold',

  // Montserrat — headings & titles
  montserrat: Platform.select({ android: 'montserrat_regular', ios: 'Montserrat-Regular' }) ?? 'montserrat_regular',
  montserratMedium: Platform.select({ android: 'montserrat_medium', ios: 'Montserrat-Medium' }) ?? 'montserrat_medium',
  montserratSemiBold: Platform.select({ android: 'montserrat_semibold', ios: 'Montserrat-SemiBold' }) ?? 'montserrat_semibold',
  montserratBold: Platform.select({ android: 'montserrat_bold', ios: 'Montserrat-Bold' }) ?? 'montserrat_bold',
  montserratExtraBold: Platform.select({ android: 'montserrat_extrabold', ios: 'Montserrat-ExtraBold' }) ?? 'montserrat_extrabold',
  montserratBlack: Platform.select({ android: 'montserrat_black', ios: 'Montserrat-Black' }) ?? 'montserrat_black',

  // San Francisco Display — numbers & iOS style
  sfDisplay: Platform.select({ android: 'SanFranciscoDisplay_Regular', ios: 'System' }) ?? 'SanFranciscoDisplay_Regular',
  sfDisplayMedium: Platform.select({ android: 'SanFranciscoDisplay_Medium', ios: 'System' }) ?? 'SanFranciscoDisplay_Medium',
  sfDisplayBold: Platform.select({ android: 'SanFranciscoDisplay_Bold', ios: 'System' }) ?? 'SanFranciscoDisplay_Bold',
};

// Shorthand text styles
export const FontStyles = {
  // Body text
  body: { fontFamily: Fonts.inter, fontSize: 14 },
  bodyMedium: { fontFamily: Fonts.interMedium, fontSize: 14 },
  bodySemiBold: { fontFamily: Fonts.interSemiBold, fontSize: 14 },
  bodyBold: { fontFamily: Fonts.interBold, fontSize: 14 },

  // Headings
  h1: { fontFamily: Fonts.montserratBold, fontSize: 24 },
  h2: { fontFamily: Fonts.montserratBold, fontSize: 20 },
  h3: { fontFamily: Fonts.montserratSemiBold, fontSize: 17 },
  h4: { fontFamily: Fonts.interBold, fontSize: 15 },

  // Labels
  label: { fontFamily: Fonts.interSemiBold, fontSize: 12, letterSpacing: 0.5 },
  caption: { fontFamily: Fonts.inter, fontSize: 11 },

  // Numbers
  number: { fontFamily: Fonts.sfDisplayBold, fontSize: 22 },
  numberSmall: { fontFamily: Fonts.sfDisplayMedium, fontSize: 16 },

  // Buttons
  button: { fontFamily: Fonts.interBold, fontSize: 16 },
  buttonSmall: { fontFamily: Fonts.interSemiBold, fontSize: 14 },
};
