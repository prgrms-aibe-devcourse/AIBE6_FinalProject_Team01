package back.backend.domain.auth.controller;

import back.backend.domain.auth.dto.AccessTokenResponse;
import back.backend.domain.auth.dto.AdminOtpChallengeResponse;
import back.backend.domain.auth.dto.AdminOtpVerifyRequest;
import back.backend.domain.auth.dto.EmailCodeVerificationRequest;
import back.backend.domain.auth.dto.EmailRequest;
import back.backend.domain.auth.dto.LoginRequest;
import back.backend.domain.auth.dto.NicknameAvailabilityRequest;
import back.backend.domain.auth.dto.NicknameAvailabilityResponse;
import back.backend.domain.auth.dto.OAuthLoginExchangeRequest;
import back.backend.domain.auth.dto.PasswordResetRequest;
import back.backend.domain.auth.dto.SignupRequest;
import back.backend.domain.auth.dto.TokenResponse;
import back.backend.domain.auth.dto.SuspensionNoticeRequest;
import back.backend.domain.auth.dto.SuspensionNoticeResponse;
import back.backend.domain.auth.service.AuthService;
import back.backend.domain.auth.service.AdminOtpService;
import back.backend.domain.auth.service.ClientIpResolver;
import back.backend.domain.auth.service.EmailVerificationService;
import back.backend.domain.auth.service.LoginAttemptService;
import back.backend.domain.auth.service.OAuthLoginCodeService;
import back.backend.domain.auth.service.SuspensionNoticeService;
import back.backend.global.exception.BusinessException;
import back.backend.global.response.ApiResponse;
import back.backend.global.security.SecurityContextAccessor;
import back.backend.global.security.jwt.RefreshTokenCookieProvider;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@io.swagger.v3.oas.annotations.tags.Tag(name = "인증")
public class AuthController {

    private static final String REFRESH_TOKEN_COOKIE = "refreshToken";

    private final AuthService authService;
    private final SecurityContextAccessor securityContextAccessor;
    private final RefreshTokenCookieProvider refreshTokenCookieProvider;
    private final EmailVerificationService emailVerificationService;
    private final AdminOtpService adminOtpService;
    private final SuspensionNoticeService suspensionNoticeService;
    private final OAuthLoginCodeService oAuthLoginCodeService;
    private final LoginAttemptService loginAttemptService;
    private final ClientIpResolver clientIpResolver;

    public AuthController(
            AuthService authService,
            SecurityContextAccessor securityContextAccessor,
            RefreshTokenCookieProvider refreshTokenCookieProvider,
            EmailVerificationService emailVerificationService,
            AdminOtpService adminOtpService,
            SuspensionNoticeService suspensionNoticeService,
            OAuthLoginCodeService oAuthLoginCodeService,
            LoginAttemptService loginAttemptService,
            ClientIpResolver clientIpResolver
    ) {
        this.authService = authService;
        this.securityContextAccessor = securityContextAccessor;
        this.refreshTokenCookieProvider = refreshTokenCookieProvider;
        this.emailVerificationService = emailVerificationService;
        this.adminOtpService = adminOtpService;
        this.suspensionNoticeService = suspensionNoticeService;
        this.oAuthLoginCodeService = oAuthLoginCodeService;
        this.loginAttemptService = loginAttemptService;
        this.clientIpResolver = clientIpResolver;
    }

    @PostMapping("/email-verifications")
    @io.swagger.v3.oas.annotations.Operation(summary = "이메일 인증번호 발송")
    public ApiResponse<Void> sendVerificationCode(@Valid @RequestBody EmailRequest request) {
        emailVerificationService.sendCode(request.email(), request.purpose());
        return ApiResponse.successMessage("인증번호 발송 요청을 처리했습니다.");
    }

    @PostMapping("/email-verifications/confirm")
    @io.swagger.v3.oas.annotations.Operation(summary = "이메일 인증번호 확인")
    public ApiResponse<Void> verifyEmailCode(@Valid @RequestBody EmailCodeVerificationRequest request) {
        emailVerificationService.verifyCode(request.email(), request.code(), request.purpose());
        return ApiResponse.successMessage("이메일 인증이 완료되었습니다.");
    }

    @PostMapping("/signup")
    @io.swagger.v3.oas.annotations.Operation(summary = "이메일 회원가입")
    public ApiResponse<AccessTokenResponse> signup(
            @Valid @RequestBody SignupRequest request,
            HttpServletResponse response
    ) {
        return respondWithTokens(authService.signup(request), response);
    }

    @PostMapping("/nickname-availability")
    @io.swagger.v3.oas.annotations.Operation(summary = "가입 닉네임 중복 확인")
    public ApiResponse<NicknameAvailabilityResponse> checkNicknameAvailability(
            @Valid @RequestBody NicknameAvailabilityRequest request
    ) {
        return ApiResponse.success(new NicknameAvailabilityResponse(
                authService.isNicknameAvailable(request.nickname())
        ));
    }

    @PostMapping("/login")
    @io.swagger.v3.oas.annotations.Operation(summary = "이메일 로그인")
    public ApiResponse<AccessTokenResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response,
            HttpServletRequest servletRequest
    ) {
        String clientIp = clientIpResolver.resolve(servletRequest);
        return respondWithTokens(loginAttemptService.login(request, clientIp), response);
    }

    @PostMapping("/oauth/exchange")
    @io.swagger.v3.oas.annotations.Operation(summary = "소셜 로그인 임시 코드를 액세스 토큰으로 교환")
    public ApiResponse<AccessTokenResponse> exchangeOAuthLoginCode(
            @Valid @RequestBody OAuthLoginExchangeRequest request
    ) {
        return ApiResponse.success(new AccessTokenResponse(oAuthLoginCodeService.consume(request.code())));
    }

    @PostMapping("/suspension-notices/consume")
    @io.swagger.v3.oas.annotations.Operation(summary = "정지 계정 안내 정보 확인")
    public ApiResponse<SuspensionNoticeResponse> consumeSuspensionNotice(
            @Valid @RequestBody SuspensionNoticeRequest request
    ) {
        return ApiResponse.success(suspensionNoticeService.consume(request.token()));
    }

    @PostMapping("/admin/login")
    @io.swagger.v3.oas.annotations.Operation(summary = "관리자 로그인 OTP 발송")
    public ApiResponse<AdminOtpChallengeResponse> requestAdminOtp(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest servletRequest
    ) {
        return ApiResponse.success(adminOtpService.request(request, servletRequest.getRemoteAddr()));
    }

    @PostMapping("/admin/step-up")
    @io.swagger.v3.oas.annotations.Operation(summary = "부관리자 추가 인증 OTP 발송")
    public ApiResponse<AdminOtpChallengeResponse> requestSubAdminOtp() {
        return ApiResponse.success(adminOtpService.requestForSubAdmin(
                securityContextAccessor.getCurrentMemberId()));
    }

    @PostMapping("/admin/login/verify")
    @io.swagger.v3.oas.annotations.Operation(summary = "관리자 로그인 OTP 확인")
    public ApiResponse<AccessTokenResponse> verifyAdminOtp(
            @Valid @RequestBody AdminOtpVerifyRequest request,
            HttpServletResponse response
    ) {
        return respondWithTokens(adminOtpService.verify(request), response);
    }

    @PostMapping("/password-reset")
    @io.swagger.v3.oas.annotations.Operation(summary = "비밀번호 재설정")
    public ApiResponse<Void> resetPassword(@Valid @RequestBody PasswordResetRequest request) {
        authService.resetPassword(request);
        return ApiResponse.successMessage("비밀번호가 변경되었습니다.");
    }

    @PostMapping("/reissue")
    @io.swagger.v3.oas.annotations.Operation(summary = "액세스 토큰 재발급")
    public ResponseEntity<ApiResponse<AccessTokenResponse>> reissue(
            @CookieValue(name = REFRESH_TOKEN_COOKIE, required = false) String refreshToken,
            HttpServletResponse response
    ) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return ResponseEntity.noContent().build();
        }
        TokenResponse tokens;
        try {
            tokens = authService.reissue(refreshToken);
        } catch (BusinessException exception) {
            if (exception.getErrorCode().getStatus() == HttpStatus.UNAUTHORIZED) {
                response.addHeader(
                        HttpHeaders.SET_COOKIE,
                        refreshTokenCookieProvider.expire().toString());
                return ResponseEntity.noContent().build();
            }
            throw exception;
        }
        response.addHeader(HttpHeaders.SET_COOKIE, refreshTokenCookieProvider.create(tokens.refreshToken()).toString());
        return ResponseEntity.ok(ApiResponse.success(AccessTokenResponse.from(tokens)));
    }

    @PostMapping("/logout")
    @io.swagger.v3.oas.annotations.Operation(summary = "로그아웃")
    public ApiResponse<Void> logout(HttpServletResponse response) {
        authService.logout(securityContextAccessor.getCurrentMemberId());
        response.addHeader(HttpHeaders.SET_COOKIE, refreshTokenCookieProvider.expire().toString());
        return ApiResponse.ok();
    }

    private ApiResponse<AccessTokenResponse> respondWithTokens(
            TokenResponse tokens,
            HttpServletResponse response
    ) {
        response.addHeader(HttpHeaders.SET_COOKIE, refreshTokenCookieProvider.create(tokens.refreshToken()).toString());
        return ApiResponse.success(AccessTokenResponse.from(tokens));
    }
}
