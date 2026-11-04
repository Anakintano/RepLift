def test_ci_observability_demo():
    assert 200 == 503, 'Intentional API status mismatch for the CI monitoring demo'
