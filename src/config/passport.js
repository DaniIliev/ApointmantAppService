import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import AppleStrategy from "passport-apple";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = await User.findOne({ email: profile.emails[0].value });
          if (user) {
            user.googleId = profile.id;
            await user.save();
          } else {
            user = await User.create({
              email: profile.emails[0].value,
              googleId: profile.id,
              firstName: profile.name.givenName,
              lastName: profile.name.familyName,
              authProvider: "google",
            });
          }
        }
        user.oauthPicture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Facebook Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: "/api/auth/facebook/callback",
      profileFields: ["id", "emails", "name", "picture.type(large)"],
      proxy: true,
      graphAPIVersion: "v19.0",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ facebookId: profile.id });
        if (!user) {
          const email = profile.emails ? profile.emails[0].value : null;
          if (email) {
            user = await User.findOne({ email });
          }
          if (user) {
            user.facebookId = profile.id;
            await user.save();
          } else {
            user = await User.create({
              email: email || `${profile.id}@facebook.auth`,
              facebookId: profile.id,
              firstName: profile.name.givenName,
              lastName: profile.name.familyName,
              authProvider: "facebook",
            });
          }
        }
        user.oauthPicture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Apple Strategy
if (process.env.APPLE_TEAM_ID) {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_SERVICE_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH, // Path to .p8 file
        callbackURL: "/api/auth/apple/callback",
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, idToken, profile, done) => {
        try {
          // Apple profile is only sent on first login
          let user = await User.findOne({ appleId: profile.id });
          if (!user) {
            // Logic for first time login with Apple
            // Need to handle email from idToken or profile
            return done(new Error("Apple login requires manual implementation for profile extraction"), null);
          }
          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );
}

export default passport;
