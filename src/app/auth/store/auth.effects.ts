import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, ofType, Effect } from '@ngrx/effects';
import { switchMap, catchError, map, tap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { environment } from '../../../environments/environment';

import { AuthService } from '../auth.service'; 
import * as AuthActions from './auth.actions';
import { User } from '../user.model';

export interface AuthResponseData {
	kind: string;
  idToken: string;
  email: string;
  refreshToken: string;
  expiresIn: string;
  localId: string; 
  registered?: boolean;
}

const handleAuthentication = (
	expiresIn: number, 
	email: string, 
	userId: string, 
	token: string
	) => {
	const expireationDate = new Date(new Date().getTime() + 
		expiresIn*1000);
	const user = new User(email, userId, token, expireationDate);
	localStorage.setItem('userData', JSON.stringify(user));
	return new AuthActions.AuthenticateSuccess({
		email: email, 
		userId: userId, 
		token: token, 
		expirationDate: expireationDate,
		redirect: true
	});
};

const handleError = (errorRes: any) => {
	let errorMessage = 'An unknown error occurred!';
	if (!errorRes.error || !errorRes.error.error) {
		return of(new AuthActions.AuthenticateFail(errorMessage));
	}
	switch (errorRes.error.error.message) {
		case 'EMAIL_EXISTS':
			errorMessage = 'This email exists already!';
			break;
		case 'EMAIL_NOT_FOUND':
			errorMessage = 'This email does not exist!';
			break;
		case 'INVALID_PASSWORD':
			errorMessage = 'Password was invalid!';
			break;				
	}												 
	return of(new AuthActions.AuthenticateFail(errorMessage));	
};

@Injectable()
export class AuthEffects {

	@Effect()
	authSignup = this.actions$.pipe(
		ofType(AuthActions.SIGNUP_START),
		switchMap((signupAction: AuthActions.SignupStart) => {
			return this.http.post<AuthResponseData>(
				'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + environment.fbKey,
				{
					email: signupAction.payload.email,
					password: signupAction.payload.password,
					returnSecureToken: true
				}
			)
			.pipe(
				tap(resData => {
					this.authService.setLogoutTimer(+resData.expiresIn * 1000);
				}),
				map(resData => {
					return handleAuthentication(
						+resData.expiresIn, 
						resData.email, 
						resData.localId, 
						resData.idToken);
				}),
				catchError(errorRes => {
					return handleError(errorRes);
				})										
			)
	}));

	@Effect()
	authLogin = this.actions$.pipe(
		ofType(AuthActions.LOGIN_START),
		switchMap((authData: AuthActions.LoginStart) => {
		return this.http.post<AuthResponseData>(
				'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + 
					environment.fbKey, 
				{
					email: authData.payload.email,
					password: authData.payload.password,
					returnSecureToken: true
				}
			)
			.pipe(
				tap(resData => {
					this.authService.setLogoutTimer(+resData.expiresIn * 1000);
				}),				
				map(resData => {
					return handleAuthentication(+resData.expiresIn, 
						resData.email, 
						resData.localId, 
						resData.idToken);
				// const expireationDate = new Date(new Date().getTime() + 
				// 	+resData.expiresIn*1000);
				// return new AuthActions.AuthenticateSuccess(
				// 		{
				// 			email: resData.email, 
				// 			userId: resData.localId, 
				// 			token: resData.idToken, 
				// 			expirationDate: expireationDate
				// 		}
				// 	);
				}),
				catchError(errorRes => {
					return handleError(errorRes);
				//... Error handling, to return 
				//    a clean observable (i.e. not an erroneous obs)
				// let errorMessage = 'An unknown error occurred!';
				// if (!errorRes.error || !errorRes.error.error) {
				// 	return of(new AuthActions.AuthenticateFail(errorMessage));
				// }
				// switch (errorRes.error.error.message) {
				// 	case 'EMAIL_EXISTS':
				// 		errorMessage = 'This email exists already!';
				// 		break;
				// 	case 'EMAIL_NOT_FOUND':
				// 		errorMessage = 'This email does not exist!';
				// 		break;
				// 	case 'INVALID_PASSWORD':
				// 		errorMessage = 'Password was invalid!';
				// 		break;				
				// }												 
				// return of(new AuthActions.AuthenticateFail(errorMessage));
				})
			);
		}),

	);

	// Let ngrx/effects know this effect returns 
	//   no dispatchable ACTION
	@Effect({dispatch: false})
	// authSuccess = this.actions$.pipe(	
	authRedirect = this.actions$.pipe(
		ofType(AuthActions.AUTHENTICATE_SUCCESS
			// AuthActions.LOGOUT
			), 
		tap((authSuccessAction: AuthActions.AuthenticateSuccess) => {
			if (authSuccessAction.payload.redirect) {
				this.router.navigate(['/']);
			}
		})
	);

	@Effect()
	autoLogin = this.actions$.pipe(
		ofType(AuthActions.AUTO_LOGIN),
		map(() => {

			const userData: {
				email: string;
				id: string;
				_token: string;
				_tokenExpirationDate: string;
			} = JSON.parse(localStorage.getItem('userData'));
			if (!userData) {
				return { type: 'DUMMY' };
			}

			const loadedUser = new User(userData.email, 
				userData.id, 
				userData._token,
				new Date(userData._tokenExpirationDate)
			);

			// Use the token getter to check ... 
			if (loadedUser.token) {
				// this.user.next(loadedUser);
				const expirationDuration = new 
					Date(userData._tokenExpirationDate).getTime() - 
					new Date().getTime();
				// this.autoLogout(expirationDuration);

				this.authService.setLogoutTimer(expirationDuration);
				return new AuthActions.AuthenticateSuccess({
					email: loadedUser.email,
					userId: loadedUser.id,
					token: loadedUser.token,
					expirationDate: new Date(userData._tokenExpirationDate),
					redirect: false
					});
				// Future expirationDate (in millisecond) MINUS
				// 		current date (converted to ms) provides the 
				//    expiration in milliseconds 
			}

			return { type: 'DUMMY' };

		}));

	@Effect({dispatch: false})
	authLogout = this.actions$.pipe(
		ofType(AuthActions.LOGOUT), tap(() => {
			this.authService.clearLogoutTimer();
			localStorage.removeItem('userData');
			this.router.navigate(['/auth']);
		}));

	constructor(private actions$: Actions,
		private http: HttpClient,
		private router: Router,
		private authService: AuthService) {}

}