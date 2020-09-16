import * as passport from 'passport';
import { OAuth2Strategy as Strategy } from 'passport-google-oauth';

import User, { UserDocument } from './models/User';
import Invitation from './models/Invitation';

const dev = process.env.NODE_ENV !== 'production';

function setupGoogle({ server }) {
  if (!process.env.GOOGLE_CLIENTID) {
    return;
  }

  const verify = async (accessToken, refreshToken, profile, done) => {
    let email;
    let avatarUrl;

    if (profile.emails) {
      email = profile.emails[0].value;
    }

    if (profile.photos && profile.photos.length > 0) {
      avatarUrl = profile.photos[0].value.replace('sz=50', 'sz=128');
    }

    try {
      const user = await User.signInOrSignUpViaGoogle({
        googleId: profile.id,
        email,
        googleToken: { accessToken, refreshToken },
        displayName: profile.displayName,
        avatarUrl,
      });

      done(null, user);
    } catch (err) {
      done(err);
      console.error(err);
    }
  };

  passport.use(
    new Strategy(
      {
        clientID: process.env.GOOGLE_CLIENTID,
        clientSecret: process.env.GOOGLE_CLIENTSECRET,
        callbackURL: `${dev ? process.env.URL_API : process.env.PRODUCTION_URL_API}/oauth2callback`,
      },
      verify,
    ),
  );

  passport.serializeUser((user: UserDocument, done) => {
/* tslint:disable:no-unused-variable */
    done(null, user._id);
  });

  passport.deserializeUser((id, done) => {
    User.findById(id, User.publicFields(), (err, user) => {
      done(err, user);
    });
  });

  server.use(passport.initialize());
  server.use(passport.session());

  server.get('/auth/google', (req, res, next) => {
    const options = {
      scope: ['profile', 'email'],
      prompt: 'select_account',
    };

    if (req.query && req.query.invitationToken) {
      req.session.invitationToken = req.query.invitationToken;
    } else {
      req.session.invitationToken = null;
    }

    passport.authenticate('google', options)(req, res, next);
  });

  server.get(
    '/oauth2callback',
    passport.authenticate('google', {
      failureRedirect: '/login',
    }),
    (req, res) => {
      if (req.user && req.session.invitationToken) {
        Invitation.addUserToTeam({
          token: req.session.invitationToken,
          user: req.user,
        }).catch((err) => console.error(err));

        req.session.invitationToken = null;
      }

      let redirectUrlAfterLogin;

      if (req.user && !req.user.defaultTeamSlug) {
        redirectUrlAfterLogin = '/create-team';
      } else {
        redirectUrlAfterLogin = `/team/${req.user.defaultTeamSlug}/discussions`;
      }

      res.redirect(
        `${dev ? process.env.URL_APP : process.env.PRODUCTION_URL_APP}${redirectUrlAfterLogin}`,
      );
    },
  );
}

export { setupGoogle };
