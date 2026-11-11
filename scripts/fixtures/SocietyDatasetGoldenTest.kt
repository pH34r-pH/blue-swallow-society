package co.blueswallow.wardriver.vnext.engine

import co.blueswallow.wardriver.vnext.model.*
import co.blueswallow.wardriver.vnext.wire.ObservationWire as W
import java.nio.file.Files
import java.nio.file.Path
import java.util.Base64
import org.junit.Test

/** Run inside the pinned Wardriver core test source set; synthetic values only. */
class SocietyDatasetGoldenTest {
    @Test fun exportProducerGolden() {
        val output = Path.of(requireNotNull(System.getenv("SOCIETY_DATASET_GOLDEN_DIR")))
        Files.createDirectories(output)
        val signer = DatasetFixtures.firstSigner
        val scope = DatasetFixtures.scope(signer)
        val session = DatasetFixtures.session()
        val clock = 9_007_199_254_740_993L
        val time = CaptureTime(DatasetFixtures.epoch, ElapsedNanos(clock), ElapsedNanos(clock + 1), DatasetFixtures.wall)
        val wifi = Observation.capture(DatasetFixtures.id(), session, SourceId("synthetic.wifi"), time, FrameId("device")) {
            wifi = W.Wifi.newBuilder().setBssid("02:00:00:00:00:01").setSsid("Synthetic fixture")
                .setRssiDbm(-60).setFrequencyMhz(2412).build()
        }
        // Field 99 (varint 7) proves original unknown observation bytes survive.
        val retained = Observation.decode(wifi.encoded() + byteArrayOf(0x98.toByte(), 0x06, 0x07))
        val gnss = Observation.capture(DatasetFixtures.id(), session, SourceId("synthetic.gnss"), time, FrameId("wgs84")) {
            gnss = W.Gnss.newBuilder().setLatitudeDeg(0.0).setLongitudeDeg(0.0)
                .setHorizontalAccuracyM(5f).setProvider("synthetic").build()
        }
        val live = DatasetWire.prepare(scope, signer, DatasetTip.EMPTY,
            DatasetBatch("synthetic-live", session, listOf(retained, gnss), emptyList(), 0, false, live = true))
        val retraction = DatasetRetraction(DatasetFixtures.id(), retained.id)
        val closed = DatasetWire.prepare(scope, signer, live.tip,
            DatasetBatch("synthetic-closed", session, emptyList(), DatasetFixtures.events(session), 3, true, listOf(retraction)))
        fun b64(bytes: ByteArray) = Base64.getEncoder().encodeToString(bytes)
        fun publication(p: DatasetPublication) = """{"delta":"${b64(p.deltaBytes())}","commit":"${b64(p.commitBytes())}","head":"${b64(p.headBytes())}","commitHash":"${p.tip.commitSha256}"}"""
        val json = """{"fixtureVersion":1,"synthetic":true,"producerCommit":"2b5a526bac6cf2914c967fa61a185b4ff3db70e8","groupId":"${scope.groupId}","deviceId":"${scope.deviceId}","publicKeySpki":"${Base64.getUrlEncoder().withoutPadding().encodeToString(signer.publicKey.encoded)}","sessionId":"${session.value}","wifiId":"${retained.id.value}","gnssId":"${gnss.id.value}","captureElapsedNs":"$clock","retractionId":"${retraction.id.value}","live":${publication(live)},"closed":${publication(closed)}}"""
        Files.writeString(output.resolve("producer-golden.json"), json + "\n")
    }
}
