import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

import 'rxjs/add/operator/toPromise';

import { AuthService } from './auth.service';

@Injectable()
export class AuthGuardService implements CanActivate {
  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  canActivate() {
    return this.auth.login({
      name: 'Aaron',
      password: 'password',
    }).toPromise().then(() => true);

    /*if (this.auth.isLoggedIn() === true) {
      return true;
    }

    this.router.navigate(['/login']);
    return false;*/
  }
}
