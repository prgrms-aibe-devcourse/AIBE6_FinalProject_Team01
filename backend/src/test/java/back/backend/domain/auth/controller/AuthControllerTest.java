package back.backend.domain.auth.controller;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import back.backend.domain.auth.dto.TokenResponse;
import back.backend.domain.auth.dto.AdminOtpChallengeResponse;
import back.backend.domain.auth.dto.LoginRequest;
import back.backend.domain.auth.dto.SuspensionNoticeResponse;
import back.backend.domain.auth.exception.AuthErrorCode;
import back.backend.domain.auth.exception.LoginRateLimitException;
import back.backend.domain.auth.exception.SuspendedAccountException;
import back.backend.domain.auth.service.AuthService;
import back.backend.domain.auth.service.AdminOtpService;
import back.backend.domain.auth.service.ClientIpResolver;
import back.backend.domain.auth.service.EmailVerificationService;
import back.backend.domain.auth.service.LoginAttemptService;
import back.backend.domain.auth.service.OAuthLoginCodeService;
import back.backend.domain.auth.service.SuspensionNoticeService;
import back.backend.global.exception.BusinessException;
import back.backend.global.exception.CommonErrorCode;
import back.backend.global.security.SecurityConfig;
import back.backend.global.security.SecurityContextAccessor;
import back.backend.global.security.jwt.JwtAuthenticationFilter;
import back.backend.global.security.jwt.RefreshTokenCookieProvider;
import back.backend.domain.member.entity.Member;
import java.time.LocalDateTime;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.http.ResponseCookie;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
        controllers = AuthController.class,
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.ASSIGNABLE_TYPE,
                classes = {SecurityConfig.class, JwtAuthenticationFilter.class}))
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AuthService authService;

    @MockitoBean
    private SecurityContextAccessor securityContextAccessor;

    @MockitoBean
    private RefreshTokenCookieProvider refreshTokenCookieProvider;

    @MockitoBean
    private EmailVerificationService emailVerificationService;

    @MockitoBean
    private AdminOtpService adminOtpService;

    @MockitoBean
    private SuspensionNoticeService suspensionNoticeService;

    @MockitoBean
    private OAuthLoginCodeService oAuthLoginCodeService;

    @MockitoBean
    private LoginAttemptService loginAttemptService;

    @MockitoBean
    private ClientIpResolver clientIpResolver;

    @Test
    @DisplayName("t1 유효한 리프레시 토큰 쿠키로 재발급을 요청하면 200과 새 액세스 토큰, 새 리프레시 토큰 쿠키를 반환한다")
    void t1_reissueReturnsNewAccessTokenAndSetsRefreshTokenCookie() throws Exception {
        when(authService.reissue("refresh-token-value"))
                .thenReturn(new TokenResponse("new-access-token", "new-refresh-token"));
        ResponseCookie cookie = ResponseCookie.from("refreshToken", "new-refresh-token").build();
        when(refreshTokenCookieProvider.create("new-refresh-token")).thenReturn(cookie);

        mockMvc.perform(post("/api/auth/reissue")
                        .cookie(new Cookie("refreshToken", "refresh-token-value")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").value("new-access-token"))
                .andExpect(jsonPath("$.data.refreshToken").doesNotExist())
                .andExpect(header().string("Set-Cookie", containsString("refreshToken=new-refresh-token")));
    }

    @Test
    @DisplayName("t2 리프레시 토큰 쿠키가 없으면 비로그인 상태로 판단하고 204를 반환한다")
    void t2_reissueReturnsNoContentWhenRefreshTokenCookieIsMissing() throws Exception {
        mockMvc.perform(post("/api/auth/reissue"))
                .andExpect(status().isNoContent());

        verifyNoInteractions(authService);
    }

    @Test
    @DisplayName("t3 유효하지 않은 리프레시 토큰이면 쿠키를 만료시키고 204를 반환한다")
    void t3_reissueExpiresCookieAndReturnsNoContentWhenRefreshTokenIsInvalid() throws Exception {
        when(authService.reissue("invalid-token"))
                .thenThrow(new BusinessException(CommonErrorCode.UNAUTHORIZED, "유효하지 않은 리프레시 토큰입니다."));

        when(refreshTokenCookieProvider.expire())
                .thenReturn(ResponseCookie.from("refreshToken", "").maxAge(0).build());

        mockMvc.perform(post("/api/auth/reissue")
                        .cookie(new Cookie("refreshToken", "invalid-token")))
                .andExpect(status().isNoContent())
                .andExpect(header().string(
                        "Set-Cookie",
                        containsString("refreshToken=; Max-Age=0")));
    }

    @Test
    @DisplayName("t4 인증된 사용자가 로그아웃하면 200을 반환하고 리프레시 토큰을 삭제하며 쿠키를 만료시킨다")
    void t4_logoutReturnsOkDeletesRefreshTokenAndExpiresCookie() throws Exception {
        when(securityContextAccessor.getCurrentMemberId()).thenReturn(1L);
        ResponseCookie expiredCookie = ResponseCookie.from("refreshToken", "").maxAge(0).build();
        when(refreshTokenCookieProvider.expire()).thenReturn(expiredCookie);

        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));

        verify(authService).logout(1L);
    }

    @Test
    @DisplayName("t5 인증되지 않은 사용자가 로그아웃하면 401을 반환한다")
    void t5_logoutReturnsUnauthorizedWhenNotAuthenticated() throws Exception {
        when(securityContextAccessor.getCurrentMemberId())
                .thenThrow(new BusinessException(CommonErrorCode.UNAUTHORIZED));

        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("COMMON_401"));
    }

    @Test
    @DisplayName("t6 사용 가능한 닉네임으로 중복 확인하면 200과 true를 반환한다")
    void t6_nicknameAvailabilityReturnsTrueForAvailableNickname() throws Exception {
        when(authService.isNicknameAvailable("여행자")).thenReturn(true);

        mockMvc.perform(post("/api/auth/nickname-availability")
                        .contentType("application/json")
                        .content("{\"nickname\":\"여행자\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.available").value(true));
    }

    @Test
    @DisplayName("t7 형식에 맞지 않는 닉네임으로 중복 확인하면 400을 반환한다")
    void t7_nicknameAvailabilityRejectsInvalidNickname() throws Exception {
        mockMvc.perform(post("/api/auth/nickname-availability")
                        .contentType("application/json")
                        .content("{\"nickname\":\"a\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("t8 탈퇴한 로컬 회원이 로그인하면 409와 개인정보 보관기간 안내를 반환한다")
    void t8_loginReturnsConflictForWithdrawnLocalMember() throws Exception {
        when(clientIpResolver.resolve(any())).thenReturn("203.0.113.10");
        when(loginAttemptService.login(any(LoginRequest.class), any()))
                .thenThrow(new BusinessException(AuthErrorCode.WITHDRAWN_ACCOUNT));

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "user@example.com",
                                  "password": "Password1!"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AUTH_409_WITHDRAWN_ACCOUNT"))
                .andExpect(jsonPath("$.message").value(
                        "탈퇴 계정의 개인정보 보관기간이 아직 지나지 않아 같은 이메일 또는 소셜 계정으로 "
                                + "재가입할 수 없습니다. 보관기간이 끝난 후 다시 시도해 주세요."));
    }

    @Test
    @DisplayName("t9 인증된 부관리자가 추가 인증을 요청하면 200과 OTP 챌린지를 반환한다")
    void t9_subAdminStepUpReturnsOtpChallenge() throws Exception {
        when(securityContextAccessor.getCurrentMemberId()).thenReturn(2L);
        when(adminOtpService.requestForSubAdmin(2L))
                .thenReturn(new AdminOtpChallengeResponse("challenge", "su***@example.com", 300));

        mockMvc.perform(post("/api/auth/admin/step-up"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.challengeToken").value("challenge"))
                .andExpect(jsonPath("$.data.maskedEmail").value("su***@example.com"));
    }

    @Test
    @DisplayName("t10 정지된 회원이 로그인하면 403과 정지 사유 및 해제 예정 시각을 반환한다")
    void t10_suspendedLoginReturnsDetailedSuspensionResponse() throws Exception {
        Member member = Member.createLocal("blocked@example.com", "정지회원", "hash");
        LocalDateTime suspendedAt = LocalDateTime.of(2026, 8, 10, 19, 0);
        LocalDateTime suspendedUntil = LocalDateTime.of(2026, 8, 12, 19, 0);
        member.suspend(1L, "비정상적인 API 반복 호출", suspendedAt, suspendedUntil);
        when(clientIpResolver.resolve(any())).thenReturn("203.0.113.10");
        when(loginAttemptService.login(any(LoginRequest.class), any()))
                .thenThrow(new SuspendedAccountException(member));

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "blocked@example.com",
                                  "password": "Password1!"
                                }
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("AUTH_403_SUSPENDED"))
                .andExpect(jsonPath("$.suspensionReason").value("비정상적인 API 반복 호출"))
                .andExpect(jsonPath("$.suspendedUntil").value("2026-08-12T19:00:00"));
    }

    @Test
    @DisplayName("t11 소셜 로그인 정지 안내 토큰을 확인하면 정지 사유와 해제 예정 시각을 반환한다")
    void t11_consumeSuspensionNoticeReturnsDetailedInformation() throws Exception {
        when(suspensionNoticeService.consume("notice-token"))
                .thenReturn(new SuspensionNoticeResponse(
                        "비정상적인 API 반복 호출",
                        LocalDateTime.of(2026, 8, 10, 19, 0),
                        LocalDateTime.of(2026, 8, 12, 19, 0)));

        mockMvc.perform(post("/api/auth/suspension-notices/consume")
                        .contentType("application/json")
                        .content("{\"token\":\"notice-token\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.suspensionReason").value("비정상적인 API 반복 호출"))
                .andExpect(jsonPath("$.data.suspendedUntil").value("2026-08-12T19:00:00"));
    }

    @Test
    @DisplayName("t12 유효한 소셜 로그인 코드를 교환하면 200과 액세스 토큰을 반환한다")
    void t12_exchangeOAuthLoginCodeReturnsAccessToken() throws Exception {
        when(oAuthLoginCodeService.consume("exchange-code")).thenReturn("access-token");

        mockMvc.perform(post("/api/auth/oauth/exchange")
                        .contentType("application/json")
                        .content("{\"code\":\"exchange-code\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").value("access-token"));
    }

    @Test
    @DisplayName("t13 만료되었거나 이미 사용된 소셜 로그인 코드로 교환하면 400을 반환한다")
    void t13_exchangeOAuthLoginCodeReturnsBadRequestWhenCodeInvalid() throws Exception {
        when(oAuthLoginCodeService.consume("invalid-code"))
                .thenThrow(new BusinessException(AuthErrorCode.OAUTH_LOGIN_CODE_INVALID));

        mockMvc.perform(post("/api/auth/oauth/exchange")
                        .contentType("application/json")
                        .content("{\"code\":\"invalid-code\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AUTH_400_OAUTH_CODE"));
    }

    @Test
    @DisplayName("t14 로그인 시도 제한을 초과하면 429와 재시도 가능 시간을 반환한다")
    void t14_loginReturnsTooManyRequestsWithRetryAfterHeader() throws Exception {
        when(clientIpResolver.resolve(any())).thenReturn("203.0.113.10");
        when(loginAttemptService.login(any(LoginRequest.class), any()))
                .thenThrow(new LoginRateLimitException(240));

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("""
                                {
                                  "identifier": "user@example.com",
                                  "password": "Password1!"
                                }
                                """))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "240"))
                .andExpect(jsonPath("$.code").value("AUTH_429_LOGIN"))
                .andExpect(jsonPath("$.message").value("로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요."));
    }
}
