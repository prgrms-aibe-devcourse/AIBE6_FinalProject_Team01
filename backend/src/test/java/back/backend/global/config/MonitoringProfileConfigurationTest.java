package back.backend.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

class MonitoringProfileConfigurationTest {

    @Test
    @DisplayName("t1 운영 프로필은 Prometheus와 Metrics 엔드포인트를 노출하지 않는다")
    void t1_prodProfileDisablesMonitoringEndpoints() throws IOException {
        var sources = new YamlPropertySourceLoader().load(
                "application-prod",
                new ClassPathResource("application-prod.yml")
        );
        PropertySource<?> source = sources.getFirst();

        assertThat(source.getProperty("management.endpoints.web.exposure.include"))
                .isEqualTo("health");
        assertThat(source.getProperty("management.endpoint.prometheus.access"))
                .isEqualTo("none");
        assertThat(source.getProperty("management.endpoint.metrics.access"))
                .isEqualTo("none");
    }

    @Test
    @DisplayName("t2 운영 프로필은 환경변수 기반 Hikari 풀 설정을 제공한다")
    void t2_prodProfileProvidesConfigurableHikariPool() throws IOException {
        var sources = new YamlPropertySourceLoader().load(
                "application-prod",
                new ClassPathResource("application-prod.yml")
        );
        PropertySource<?> source = sources.getFirst();

        assertThat(source.getProperty("spring.datasource.hikari.maximum-pool-size"))
                .isEqualTo("${HIKARI_MAXIMUM_POOL_SIZE:20}");
        assertThat(source.getProperty("spring.datasource.hikari.minimum-idle"))
                .isEqualTo("${HIKARI_MINIMUM_IDLE:10}");
        assertThat(source.getProperty("spring.datasource.hikari.connection-timeout"))
                .isEqualTo("${HIKARI_CONNECTION_TIMEOUT_MS:3000}");
    }
}
